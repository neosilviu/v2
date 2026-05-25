import type { PluginBundle, PluginManifest } from "@v2/plugin-contracts";
import type { SettingScope, WorkspaceLayout } from "@v2/rpc-contracts";

export class CoreRepository {
  constructor(private readonly db: D1Database) {}

  async ensureWorkspace(workspaceId: string, name = "Default Workspace") {
    await this.db.prepare("INSERT OR IGNORE INTO workspaces (id, name) VALUES (?, ?)").bind(workspaceId, name).run();
  }

  async installManifest(manifest: PluginManifest, bundle?: PluginBundle) {
    await this.db.prepare(`INSERT INTO installed_plugins (id, name, version, manifest_json, package_object_key, package_sha256)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, version = excluded.version, manifest_json = excluded.manifest_json, package_object_key = excluded.package_object_key, package_sha256 = excluded.package_sha256`)
      .bind(manifest.id, manifest.name, manifest.version, JSON.stringify(manifest), bundle?.package.objectKey ?? null, bundle?.package.sha256 ?? null).run();
  }

  async installed(): Promise<PluginManifest[]> {
    const rows = await this.db.prepare("SELECT manifest_json FROM installed_plugins ORDER BY name").all<{ manifest_json: string }>();
    return rows.results.map((row) => JSON.parse(row.manifest_json) as PluginManifest);
  }

  async activate(workspaceId: string, pluginId: string) {
    await this.ensureWorkspace(workspaceId);
    await this.db.prepare("INSERT INTO workspace_plugins (workspace_id, plugin_id, active) VALUES (?, ?, 1) ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET active = 1")
      .bind(workspaceId, pluginId).run();
    await this.audit(workspaceId, "plugin.activate", { pluginId });
    return { workspaceId, pluginId, activatedAt: new Date().toISOString() };
  }

  async activePlugins(workspaceId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT plugin_id FROM workspace_plugins WHERE workspace_id = ? AND active = 1").bind(workspaceId).all<{ plugin_id: string }>();
    return rows.results.map((row) => row.plugin_id);
  }

  async setSetting(workspaceId: string, scope: SettingScope, key: string, value: unknown) {
    await this.ensureWorkspace(workspaceId);
    await this.db.prepare(`INSERT INTO workspace_settings (workspace_id, scope, key, value_json, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, scope, key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`)
      .bind(workspaceId, scope, key, JSON.stringify(value)).run();
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
    await this.setSetting(workspaceId, "platform", "shell.layout", layout);
    await this.audit(workspaceId, "layout.save", { zones: layout.zones.length, placements: layout.placements.length });
  }

  async audit(workspaceId: string | null, action: string, payload?: unknown) {
    const id = crypto.randomUUID();
    await this.db.prepare("INSERT INTO audit_events (id, workspace_id, action, payload_json) VALUES (?, ?, ?, ?)")
      .bind(id, workspaceId, action, payload === undefined ? null : JSON.stringify(payload)).run();
  }
}
