import { pluginManifestSchema, type PluginBundle, type PluginManifest } from "@v2/plugin-contracts";
import type { SettingScope, WorkspaceLayout } from "@v2/rpc-contracts";

export type PluginWorkspaceState = {
  workspaceId: string;
  pluginId: string;
  active: boolean;
  updatedAt: string;
};

export type CatalogPlugin = {
  manifest: PluginManifest;
  category: string;
  demoAvailable: boolean;
  source: string;
};

export type SandboxSurfaceAsset = {
  pluginId: string;
  surfaceId: string;
  objectKey: string;
  entry: string;
};

export class CoreRepository {
  constructor(private readonly db: D1Database) {}

  async ensureWorkspace(workspaceId: string, name = "Default Workspace") {
    await this.db.prepare("INSERT OR IGNORE INTO workspaces (id, name) VALUES (?, ?)").bind(workspaceId, name).run();
  }

  async installManifest(manifest: PluginManifest, bundle?: PluginBundle) {
    const packageData = bundle?.package;
    const statements = [
      this.db.prepare(`INSERT INTO installed_plugins
        (id, name, version, manifest_json, package_object_key, package_sha256, package_size_bytes, package_format, worker_isolation, ui_mode, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          version = excluded.version,
          manifest_json = excluded.manifest_json,
          package_object_key = excluded.package_object_key,
          package_sha256 = excluded.package_sha256,
          package_size_bytes = excluded.package_size_bytes,
          package_format = excluded.package_format,
          worker_isolation = excluded.worker_isolation,
          ui_mode = excluded.ui_mode,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(
          manifest.id,
          manifest.name,
          manifest.version,
          JSON.stringify(manifest),
          packageData?.objectKey ?? null,
          packageData?.sha256 ?? null,
          packageData?.sizeBytes ?? null,
          packageData?.format ?? null,
          bundle?.worker.isolation ?? "none",
          bundle?.ui.mode ?? "declarative",
        ),
      this.db.prepare("DELETE FROM plugin_capabilities WHERE plugin_id = ?").bind(manifest.id),
      ...manifest.capabilities.map((capability) => this.db.prepare("INSERT INTO plugin_capabilities (plugin_id, capability_id, description, risk) VALUES (?, ?, ?, ?)")
        .bind(manifest.id, capability.id, capability.description ?? null, capability.risk)),
    ];
    if (packageData) {
      statements.push(this.db.prepare("INSERT OR IGNORE INTO plugin_packages (id, plugin_id, version, object_key, sha256, size_bytes, format) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(`${manifest.id}@${manifest.version}:${packageData.sha256}`, manifest.id, manifest.version, packageData.objectKey, packageData.sha256, packageData.sizeBytes, packageData.format));
    }
    await this.db.batch(statements);
  }

  async installed(): Promise<PluginManifest[]> {
    const rows = await this.db.prepare("SELECT manifest_json FROM installed_plugins ORDER BY name").all<{ manifest_json: string }>();
    return rows.results.map((row) => pluginManifestSchema.parse(JSON.parse(row.manifest_json)));
  }

  async installedById(pluginId: string): Promise<PluginManifest | undefined> {
    const row = await this.db.prepare("SELECT manifest_json FROM installed_plugins WHERE id = ?").bind(pluginId).first<{ manifest_json: string }>();
    return row ? pluginManifestSchema.parse(JSON.parse(row.manifest_json)) : undefined;
  }

  async catalogPlugins(): Promise<CatalogPlugin[]> {
    const rows = await this.db.prepare("SELECT manifest_json, category, demo_available, source FROM plugin_catalog ORDER BY name").all<{ manifest_json: string; category: string; demo_available: number; source: string }>();
    return rows.results.map((row) => ({ manifest: pluginManifestSchema.parse(JSON.parse(row.manifest_json)), category: row.category, demoAvailable: row.demo_available === 1, source: row.source }));
  }

  async catalogPlugin(pluginId: string): Promise<CatalogPlugin | undefined> {
    const row = await this.db.prepare("SELECT manifest_json, category, demo_available, source FROM plugin_catalog WHERE plugin_id = ?").bind(pluginId).first<{ manifest_json: string; category: string; demo_available: number; source: string }>();
    return row ? { manifest: pluginManifestSchema.parse(JSON.parse(row.manifest_json)), category: row.category, demoAvailable: row.demo_available === 1, source: row.source } : undefined;
  }

  async resolveSandboxSurface(workspaceId: string, surfaceId: string): Promise<SandboxSurfaceAsset | undefined> {
    const rows = await this.db.prepare(`SELECT p.id AS plugin_id, p.manifest_json, p.package_object_key
      FROM installed_plugins p
      INNER JOIN workspace_plugins w ON w.plugin_id = p.id
      WHERE w.workspace_id = ? AND w.active = 1 AND p.package_object_key IS NOT NULL`)
      .bind(workspaceId).all<{ plugin_id: string; manifest_json: string; package_object_key: string }>();
    for (const row of rows.results) {
      const manifest = pluginManifestSchema.parse(JSON.parse(row.manifest_json));
      const surface = manifest.contributes.surfaces.find((item) => item.id === surfaceId);
      if (surface?.renderer.mode === "sandbox-frame") {
        return { pluginId: row.plugin_id, surfaceId, objectKey: row.package_object_key, entry: surface.renderer.entry };
      }
    }
    return undefined;
  }

  async setActive(workspaceId: string, pluginId: string, active: boolean): Promise<PluginWorkspaceState | undefined> {
    if (!await this.installedById(pluginId)) return undefined;
    await this.ensureWorkspace(workspaceId);
    await this.db.prepare(`INSERT INTO workspace_plugins
      (workspace_id, plugin_id, active, activated_at, deactivated_at, updated_at)
      VALUES (?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, CASE WHEN ? = 0 THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET
        active = excluded.active,
        activated_at = CASE WHEN excluded.active = 1 THEN CURRENT_TIMESTAMP ELSE workspace_plugins.activated_at END,
        deactivated_at = CASE WHEN excluded.active = 0 THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(workspaceId, pluginId, active ? 1 : 0, active ? 1 : 0, active ? 1 : 0).run();
    await this.audit(workspaceId, active ? "plugin.activate" : "plugin.deactivate", { pluginId });
    return { workspaceId, pluginId, active, updatedAt: new Date().toISOString() };
  }

  activate(workspaceId: string, pluginId: string) { return this.setActive(workspaceId, pluginId, true); }
  deactivate(workspaceId: string, pluginId: string) { return this.setActive(workspaceId, pluginId, false); }

  async activePlugins(workspaceId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT plugin_id FROM workspace_plugins WHERE workspace_id = ? AND active = 1").bind(workspaceId).all<{ plugin_id: string }>();
    return rows.results.map((row) => row.plugin_id);
  }

  async workspacePlugins(workspaceId: string): Promise<PluginWorkspaceState[]> {
    const rows = await this.db.prepare("SELECT workspace_id, plugin_id, active, updated_at FROM workspace_plugins WHERE workspace_id = ?").bind(workspaceId).all<{ workspace_id: string; plugin_id: string; active: number; updated_at: string }>();
    return rows.results.map((row) => ({ workspaceId: row.workspace_id, pluginId: row.plugin_id, active: row.active === 1, updatedAt: row.updated_at }));
  }

  async declaredCapabilities(pluginId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT capability_id FROM plugin_capabilities WHERE plugin_id = ?").bind(pluginId).all<{ capability_id: string }>();
    return rows.results.map((row) => row.capability_id);
  }

  async grantCapabilities(workspaceId: string, pluginId: string, capabilities: string[]) {
    await this.ensureWorkspace(workspaceId);
    await this.db.batch([
      this.db.prepare("INSERT INTO workspace_plugins (workspace_id, plugin_id, active, updated_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP").bind(workspaceId, pluginId),
      this.db.prepare("DELETE FROM workspace_capability_grants WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId),
      ...capabilities.map((capability) => this.db.prepare("INSERT INTO workspace_capability_grants (workspace_id, plugin_id, capability_id) VALUES (?, ?, ?)").bind(workspaceId, pluginId, capability)),
    ]);
    await this.audit(workspaceId, "plugin.capabilities.grant", { pluginId, capabilities });
    return capabilities;
  }

  async grantedCapabilities(workspaceId: string, pluginId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT capability_id FROM workspace_capability_grants WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId).all<{ capability_id: string }>();
    return rows.results.map((row) => row.capability_id);
  }

  async setSetting(workspaceId: string, scope: SettingScope, key: string, value: unknown) {
    await this.ensureWorkspace(workspaceId);
    await this.db.prepare("INSERT INTO workspace_settings (workspace_id, scope, key, value_json, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, scope, key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind(workspaceId, scope, key, JSON.stringify(value)).run();
  }

  async listSettings(workspaceId: string, scope: SettingScope): Promise<Record<string, unknown>> {
    const rows = await this.db.prepare("SELECT key, value_json FROM workspace_settings WHERE workspace_id = ? AND scope = ?").bind(workspaceId, scope).all<{ key: string; value_json: string }>();
    return Object.fromEntries(rows.results.map((row) => [row.key, JSON.parse(row.value_json) as unknown]));
  }

  async saveLayout(workspaceId: string, layout: WorkspaceLayout) {
    await this.ensureWorkspace(workspaceId);
    await this.db.prepare("INSERT INTO workspace_layouts (workspace_id, layout_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id) DO UPDATE SET layout_json = excluded.layout_json, updated_at = CURRENT_TIMESTAMP")
      .bind(workspaceId, JSON.stringify(layout)).run();
    await this.audit(workspaceId, "layout.save", { zones: layout.zones.length, placements: layout.placements.length });
  }

  async getLayout(workspaceId: string): Promise<WorkspaceLayout | undefined> {
    const row = await this.db.prepare("SELECT layout_json FROM workspace_layouts WHERE workspace_id = ?").bind(workspaceId).first<{ layout_json: string }>();
    return row ? JSON.parse(row.layout_json) as WorkspaceLayout : undefined;
  }

  async audit(workspaceId: string | null, action: string, payload?: unknown, actorId?: string) {
    await this.db.prepare("INSERT INTO audit_events (id, workspace_id, actor_id, action, payload_json) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), workspaceId, actorId ?? null, action, payload === undefined ? null : JSON.stringify(payload)).run();
  }
}
