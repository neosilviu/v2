import type { SettingScope, WorkspaceLayout } from "@v2/rpc-contracts";
import type { PluginBundle, PluginManifest } from "./plugin-package";

export type PluginActivation = { workspaceId: string; pluginId: string; activatedAt: string };

export class CoreRepository {
  constructor(private readonly db: D1Database) {}

  async ensureWorkspace(workspaceId: string, name = "Default Workspace") {
    await this.db.prepare("INSERT OR IGNORE INTO workspaces (id, name) VALUES (?, ?)").bind(workspaceId, name).run();
  }

  async installManifest(manifest: PluginManifest, bundle?: PluginBundle) {
    const metadata = bundle?.package;
    const statements = [
      this.db.prepare(`INSERT INTO installed_plugins (id, name, version, manifest_json, package_object_key, package_sha256, package_size_bytes, package_format, worker_isolation, ui_mode, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, version = excluded.version, manifest_json = excluded.manifest_json,
          package_object_key = excluded.package_object_key, package_sha256 = excluded.package_sha256, package_size_bytes = excluded.package_size_bytes,
          package_format = excluded.package_format, worker_isolation = excluded.worker_isolation, ui_mode = excluded.ui_mode, updated_at = CURRENT_TIMESTAMP`)
        .bind(
          manifest.id,
          manifest.name,
          manifest.version,
          JSON.stringify(manifest),
          metadata?.objectKey ?? null,
          metadata?.sha256 ?? null,
          metadata?.sizeBytes ?? null,
          metadata?.format ?? null,
          bundle?.worker.isolation ?? "none",
          bundle?.ui.mode ?? "declarative",
        ),
      this.db.prepare("DELETE FROM plugin_capabilities WHERE plugin_id = ?").bind(manifest.id),
      ...manifest.capabilities.map((capability) => this.db.prepare("INSERT INTO plugin_capabilities (plugin_id, capability_id, description, risk) VALUES (?, ?, ?, ?)")
        .bind(manifest.id, capability.id, capability.description ?? null, capability.risk)),
    ];
    if (metadata) {
      statements.push(this.db.prepare(`INSERT INTO plugin_packages (plugin_id, object_key, sha256, size_bytes, format)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(plugin_id) DO UPDATE SET object_key = excluded.object_key, sha256 = excluded.sha256, size_bytes = excluded.size_bytes, format = excluded.format`)
        .bind(manifest.id, metadata.objectKey, metadata.sha256, metadata.sizeBytes, metadata.format));
    }
    await this.db.batch(statements);
  }

  async installed(): Promise<PluginManifest[]> {
    const rows = await this.db.prepare("SELECT manifest_json FROM installed_plugins ORDER BY name").all<{ manifest_json: string }>();
    return rows.results.map((row) => JSON.parse(row.manifest_json) as PluginManifest);
  }

  async installedById(pluginId: string): Promise<PluginManifest | undefined> {
    const row = await this.db.prepare("SELECT manifest_json FROM installed_plugins WHERE id = ?").bind(pluginId).first<{ manifest_json: string }>();
    return row ? JSON.parse(row.manifest_json) as PluginManifest : undefined;
  }

  async activate(workspaceId: string, pluginId: string): Promise<PluginActivation | undefined> {
    if (!await this.installedById(pluginId)) return undefined;
    await this.ensureWorkspace(workspaceId);
    await this.db.prepare(`INSERT INTO workspace_plugins (workspace_id, plugin_id, active, activated_at, deactivated_at, updated_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET active = 1, activated_at = CURRENT_TIMESTAMP, deactivated_at = NULL, updated_at = CURRENT_TIMESTAMP`)
      .bind(workspaceId, pluginId).run();
    await this.audit(workspaceId, "plugin.activate", { pluginId });
    return { workspaceId, pluginId, activatedAt: new Date().toISOString() };
  }

  async deactivate(workspaceId: string, pluginId: string): Promise<PluginActivation | undefined> {
    if (!await this.installedById(pluginId)) return undefined;
    await this.ensureWorkspace(workspaceId);
    await this.db.prepare(`INSERT INTO workspace_plugins (workspace_id, plugin_id, active, deactivated_at, updated_at)
      VALUES (?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET active = 0, deactivated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`)
      .bind(workspaceId, pluginId).run();
    await this.audit(workspaceId, "plugin.deactivate", { pluginId });
    return { workspaceId, pluginId, activatedAt: new Date().toISOString() };
  }

  async activePlugins(workspaceId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT plugin_id FROM workspace_plugins WHERE workspace_id = ? AND active = 1").bind(workspaceId).all<{ plugin_id: string }>();
    return rows.results.map((row) => row.plugin_id);
  }

  async declaredCapabilities(pluginId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT capability_id FROM plugin_capabilities WHERE plugin_id = ?").bind(pluginId).all<{ capability_id: string }>();
    return rows.results.map((row) => row.capability_id);
  }

  async grantCapabilities(workspaceId: string, pluginId: string, capabilities: string[]) {
    await this.ensureWorkspace(workspaceId);
    const statements = [
      this.db.prepare(`INSERT INTO workspace_plugins (workspace_id, plugin_id, active, updated_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET active = 1, updated_at = CURRENT_TIMESTAMP`)
        .bind(workspaceId, pluginId),
      this.db.prepare("DELETE FROM workspace_capability_grants WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId),
      ...capabilities.map((capability) => this.db.prepare("INSERT INTO workspace_capability_grants (workspace_id, plugin_id, capability_id) VALUES (?, ?, ?)")
        .bind(workspaceId, pluginId, capability)),
    ];
    await this.db.batch(statements);
    await this.audit(workspaceId, "plugin.capabilities.grant", { pluginId, capabilities });
    return capabilities;
  }

  async grantedCapabilities(workspaceId: string, pluginId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT capability_id FROM workspace_capability_grants WHERE workspace_id = ? AND plugin_id = ?")
      .bind(workspaceId, pluginId).all<{ capability_id: string }>();
    return rows.results.map((row) => row.capability_id);
  }

  async setSetting(workspaceId: string, scope: SettingScope, key: string, value: unknown) {
    await this.ensureWorkspace(workspaceId);
    await this.db.prepare(`INSERT INTO workspace_settings (workspace_id, scope, key, value_json, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, scope, key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`)
      .bind(workspaceId, scope, key, JSON.stringify(value)).run();
    await this.audit(workspaceId, "setting.write", { scope, key });
  }

  async getSetting(workspaceId: string, scope: SettingScope, key: string): Promise<unknown | undefined> {
    const row = await this.db.prepare("SELECT value_json FROM workspace_settings WHERE workspace_id = ? AND scope = ? AND key = ?")
      .bind(workspaceId, scope, key).first<{ value_json: string }>();
    return row ? JSON.parse(row.value_json) : undefined;
  }

  async listSettings(workspaceId: string, scope: SettingScope): Promise<Record<string, unknown>> {
    const rows = await this.db.prepare("SELECT key, value_json FROM workspace_settings WHERE workspace_id = ? AND scope = ?")
      .bind(workspaceId, scope).all<{ key: string; value_json: string }>();
    return Object.fromEntries(rows.results.map((row) => [row.key, JSON.parse(row.value_json) as unknown]));
  }

  async saveLayout(workspaceId: string, layout: WorkspaceLayout) {
    await this.ensureWorkspace(workspaceId);
    await this.db.prepare(`INSERT INTO workspace_layouts (workspace_id, layout_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id) DO UPDATE SET layout_json = excluded.layout_json, updated_at = CURRENT_TIMESTAMP`)
      .bind(workspaceId, JSON.stringify(layout)).run();
    await this.audit(workspaceId, "layout.save", { zones: layout.zones.length, placements: layout.placements.length });
  }

  async getLayout(workspaceId: string): Promise<WorkspaceLayout | undefined> {
    const row = await this.db.prepare("SELECT layout_json FROM workspace_layouts WHERE workspace_id = ?")
      .bind(workspaceId).first<{ layout_json: string }>();
    return row ? JSON.parse(row.layout_json) as WorkspaceLayout : undefined;
  }

  async audit(workspaceId: string | null, action: string, payload?: unknown) {
    await this.db.prepare("INSERT INTO audit_events (id, workspace_id, action, payload_json) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), workspaceId, action, payload === undefined ? null : JSON.stringify(payload)).run();
  }
}
