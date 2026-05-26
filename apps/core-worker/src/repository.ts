import { declarativeUiSchema, pluginManifestSchema, type PluginBundle, type PluginManifest, type PublicContributionAccess, type PublicRouteContribution, type PublicSurfaceContribution, type PublicToolContribution, type SurfaceContribution } from "@v2/plugin-contracts";
import type { SettingScope, WorkspaceLayout } from "@v2/rpc-contracts";
import { declarativePageContributionSchema, type AccessMode, type DeclarativePageContribution } from "@v2/ui-schema";

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

export type CatalogRelease = {
  id: string;
  pluginId: string;
  version: string;
  manifest: PluginManifest;
  packageObjectKey: string;
  sha256: string;
  sizeBytes: number;
  format: "zip";
  workerIsolation: PluginBundle["worker"]["isolation"];
  uiMode: PluginBundle["ui"]["mode"];
  status: "draft" | "published" | "deprecated";
  source: string;
};

export type SandboxSurfaceAsset = {
  pluginId: string;
  surfaceId: string;
  objectKey: string;
  entry: string;
};

export type PublicationKind = "route" | "surface" | "tool";
export type PublicationStatus = "draft" | "published" | "unpublished" | "disabled";
export type PublicContribution = PublicRouteContribution | PublicSurfaceContribution | PublicToolContribution;
export type PluginUiContribution = {
  pluginId: string;
  contributionId: string;
  contributionType: "surface" | "page" | "route" | "slot" | "menu";
  accessMode: AccessMode;
  zoneId: string | null;
  templateId: string;
  schema: DeclarativePageContribution;
  requiredPermission: string | null;
  version: string;
};
export type WorkspacePublication = {
  id: string;
  workspaceId: string;
  pluginId: string;
  contributionKind: PublicationKind;
  publicationType?: "route" | "surface" | "tool" | "content";
  contributionId: string;
  publicPath: string;
  title: string;
  templateId?: string;
  schema?: DeclarativePageContribution;
  status: PublicationStatus;
  policyId: string | null;
  access: PublicContributionAccess;
};
export type PublicDelivery = {
  publication: WorkspacePublication;
  manifest: PluginManifest;
  contribution: PublicContribution;
};

export class CoreRepository {
  constructor(private readonly db: D1Database) {}

  async ensureWorkspace(workspaceId: string, name = "Default Workspace") {
    await this.db.prepare("INSERT OR IGNORE INTO workspaces (id, name) VALUES (?, ?)").bind(workspaceId, name).run();
  }

  private declarativeSurfacePage(manifest: PluginManifest, surface: SurfaceContribution): DeclarativePageContribution | undefined {
    if (surface.renderer.mode !== "declarative") return undefined;
    if (surface.renderer.schema) {
      const page = declarativePageContributionSchema.safeParse(surface.renderer.schema);
      if (page.success) return page.data;
      const legacy = declarativeUiSchema.safeParse(surface.renderer.schema);
      if (legacy.success) {
        return declarativePageContributionSchema.parse({
          id: surface.id,
          title: surface.title,
          templateId: surface.kind === "settings" ? "admin.settings" : "public.contentPage",
          access: "private",
          slots: [{ id: `${surface.id}.body`, slot: surface.kind === "settings" ? "header" : "body", blocks: legacy.data.body.filter((block) => block.type !== "action") }],
          actions: legacy.data.body.filter((block) => block.type === "action").map((block, index) => ({ id: `${surface.id}.action.${index}`, title: block.label, commandId: block.commandId, variant: block.variant })),
        });
      }
    }
    return declarativePageContributionSchema.parse({
      id: surface.id,
      title: surface.title,
      templateId: surface.kind === "settings" ? "admin.settings" : "admin.detail",
      access: "private",
      slots: [{ id: `${surface.id}.placeholder`, slot: "header", blocks: [{ type: "text", text: `${manifest.name} declares this runtime surface.`, tone: "muted" }] }],
    });
  }

  private uiContributionsFor(manifest: PluginManifest): PluginUiContribution[] {
    return manifest.contributes.surfaces.flatMap((surface) => {
      const page = this.declarativeSurfacePage(manifest, surface);
      if (!page) return [];
      return [{
        pluginId: manifest.id,
        contributionId: surface.id,
        contributionType: "surface" as const,
        accessMode: page.access,
        zoneId: surface.zone,
        templateId: page.templateId,
        schema: page,
        requiredPermission: page.actions.find((action) => action.access === "permission-gated")?.commandId ?? null,
        version: manifest.version,
      }];
    });
  }

  async installManifest(manifest: PluginManifest, bundle?: PluginBundle) {
    const packageData = bundle?.package;
    const uiContributions = this.uiContributionsFor(manifest);
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
      this.db.prepare("DELETE FROM plugin_ui_contributions WHERE plugin_id = ? AND version = ?").bind(manifest.id, manifest.version),
      ...manifest.capabilities.map((capability) => this.db.prepare("INSERT INTO plugin_capabilities (plugin_id, capability_id, description, risk) VALUES (?, ?, ?, ?)")
        .bind(manifest.id, capability.id, capability.description ?? null, capability.risk)),
      ...uiContributions.map((contribution) => this.db.prepare(`INSERT INTO plugin_ui_contributions
        (id, plugin_id, contribution_id, contribution_type, access_mode, zone_id, template_id, schema_json, required_permission, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(plugin_id, contribution_id, version) DO UPDATE SET
          contribution_type = excluded.contribution_type,
          access_mode = excluded.access_mode,
          zone_id = excluded.zone_id,
          template_id = excluded.template_id,
          schema_json = excluded.schema_json,
          required_permission = excluded.required_permission,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(`${manifest.id}:${contribution.contributionId}:${manifest.version}`, manifest.id, contribution.contributionId, contribution.contributionType, contribution.accessMode, contribution.zoneId, contribution.templateId, JSON.stringify(contribution.schema), contribution.requiredPermission, contribution.version)),
    ];
    if (packageData) {
      statements.push(this.db.prepare("INSERT OR IGNORE INTO plugin_packages (id, plugin_id, version, object_key, sha256, size_bytes, format) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(`${manifest.id}@${manifest.version}:${packageData.sha256}`, manifest.id, manifest.version, packageData.objectKey, packageData.sha256, packageData.sizeBytes, packageData.format));
    }
    await this.db.batch(statements);
  }

  async pluginUiContribution(pluginId: string, contributionId: string): Promise<PluginUiContribution | undefined> {
    const row = await this.db.prepare(`SELECT plugin_id, contribution_id, contribution_type, access_mode, zone_id, template_id, schema_json, required_permission, version
      FROM plugin_ui_contributions
      WHERE plugin_id = ? AND contribution_id = ?
      ORDER BY updated_at DESC
      LIMIT 1`)
      .bind(pluginId, contributionId)
      .first<{ plugin_id: string; contribution_id: string; contribution_type: PluginUiContribution["contributionType"]; access_mode: AccessMode; zone_id: string | null; template_id: string; schema_json: string; required_permission: string | null; version: string }>();
    return row ? { pluginId: row.plugin_id, contributionId: row.contribution_id, contributionType: row.contribution_type, accessMode: row.access_mode, zoneId: row.zone_id, templateId: row.template_id, schema: declarativePageContributionSchema.parse(JSON.parse(row.schema_json)), requiredPermission: row.required_permission, version: row.version } : undefined;
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

  async publishCatalogRelease(bundle: PluginBundle, options: { category: string; demoAvailable: boolean; source: string; status?: CatalogRelease["status"] }): Promise<CatalogRelease> {
    const releaseId = `${bundle.manifest.id}@${bundle.manifest.version}:${bundle.package.sha256}`;
    const status = options.status ?? "published";
    await this.db.batch([
      this.db.prepare(`INSERT INTO plugin_catalog (plugin_id, name, version, manifest_json, category, demo_available, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(plugin_id) DO UPDATE SET
          name = excluded.name,
          version = excluded.version,
          manifest_json = excluded.manifest_json,
          category = excluded.category,
          demo_available = excluded.demo_available,
          source = excluded.source,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(bundle.manifest.id, bundle.manifest.name, bundle.manifest.version, JSON.stringify(bundle.manifest), options.category, options.demoAvailable ? 1 : 0, options.source),
      this.db.prepare(`INSERT INTO plugin_catalog_releases
        (id, plugin_id, version, manifest_json, package_object_key, sha256, size_bytes, format, worker_isolation, ui_mode, status, source, published_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
        ON CONFLICT(plugin_id, version, sha256) DO UPDATE SET
          manifest_json = excluded.manifest_json,
          package_object_key = excluded.package_object_key,
          size_bytes = excluded.size_bytes,
          format = excluded.format,
          worker_isolation = excluded.worker_isolation,
          ui_mode = excluded.ui_mode,
          status = excluded.status,
          source = excluded.source,
          published_at = CASE WHEN excluded.status = 'published' THEN COALESCE(plugin_catalog_releases.published_at, CURRENT_TIMESTAMP) ELSE plugin_catalog_releases.published_at END,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(releaseId, bundle.manifest.id, bundle.manifest.version, JSON.stringify(bundle.manifest), bundle.package.objectKey, bundle.package.sha256, bundle.package.sizeBytes, bundle.package.format, bundle.worker.isolation, bundle.ui.mode, status, options.source, status),
    ]);
    const release = await this.publishedCatalogRelease(bundle.manifest.id);
    if (status === "published" && release) return release;
    return {
      id: releaseId,
      pluginId: bundle.manifest.id,
      version: bundle.manifest.version,
      manifest: bundle.manifest,
      packageObjectKey: bundle.package.objectKey,
      sha256: bundle.package.sha256,
      sizeBytes: bundle.package.sizeBytes,
      format: bundle.package.format,
      workerIsolation: bundle.worker.isolation,
      uiMode: bundle.ui.mode,
      status,
      source: options.source,
    };
  }

  async publishedCatalogRelease(pluginId: string): Promise<CatalogRelease | undefined> {
    const row = await this.db.prepare(`SELECT id, plugin_id, version, manifest_json, package_object_key, sha256, size_bytes, format, worker_isolation, ui_mode, status, source
      FROM plugin_catalog_releases
      WHERE plugin_id = ? AND status = 'published'
      ORDER BY published_at DESC, created_at DESC
      LIMIT 1`)
      .bind(pluginId)
      .first<{ id: string; plugin_id: string; version: string; manifest_json: string; package_object_key: string; sha256: string; size_bytes: number; format: "zip"; worker_isolation: PluginBundle["worker"]["isolation"]; ui_mode: PluginBundle["ui"]["mode"]; status: CatalogRelease["status"]; source: string }>();
    return row ? {
      id: row.id,
      pluginId: row.plugin_id,
      version: row.version,
      manifest: pluginManifestSchema.parse(JSON.parse(row.manifest_json)),
      packageObjectKey: row.package_object_key,
      sha256: row.sha256,
      sizeBytes: row.size_bytes,
      format: row.format,
      workerIsolation: row.worker_isolation,
      uiMode: row.ui_mode,
      status: row.status,
      source: row.source,
    } : undefined;
  }

  releaseBundle(release: CatalogRelease): PluginBundle {
    return {
      manifest: release.manifest,
      worker: { isolation: release.workerIsolation },
      ui: { mode: release.uiMode },
      package: {
        format: release.format,
        sha256: release.sha256,
        sizeBytes: release.sizeBytes,
        objectKey: release.packageObjectKey,
      },
    };
  }

  findPublicContribution(manifest: PluginManifest, kind: PublicationKind, contributionId: string): PublicContribution | undefined {
    if (kind === "route") return manifest.contributes.publicRoutes.find((item) => item.id === contributionId);
    if (kind === "surface") return manifest.contributes.publicSurfaces.find((item) => item.id === contributionId);
    return manifest.contributes.publicTools.find((item) => item.id === contributionId);
  }

  async publishWorkspaceContribution(input: { workspaceId: string; pluginId: string; contributionKind: PublicationKind; contributionId: string; publicPath?: string; title?: string; access?: PublicContributionAccess }): Promise<WorkspacePublication | undefined> {
    const manifest = await this.installedById(input.pluginId);
    if (!manifest) return undefined;
    const active = await this.activePlugins(input.workspaceId);
    if (!active.includes(input.pluginId)) return undefined;
    const contribution = this.findPublicContribution(manifest, input.contributionKind, input.contributionId);
    if (!contribution) return undefined;
    const publicPath = input.publicPath ?? contribution.path;
    const title = input.title ?? contribution.title;
    const access = input.access ?? contribution.access;
    const uiContribution = await this.pluginUiContribution(input.pluginId, input.contributionId);
    const templateId = uiContribution?.templateId ?? "public.contentPage";
    const schemaJson = JSON.stringify(uiContribution?.schema ?? {});
    const publicationId = `${input.workspaceId}:${input.pluginId}:${input.contributionKind}:${input.contributionId}`;
    const policyId = `${publicationId}:policy`;
    await this.db.batch([
      this.db.prepare(`INSERT INTO public_access_policies (id, workspace_id, name, access, authentication_mode, rules_json, allowed_operations_json, enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, access = excluded.access, authentication_mode = excluded.authentication_mode, rules_json = excluded.rules_json, allowed_operations_json = excluded.allowed_operations_json, enabled = 1, updated_at = CURRENT_TIMESTAMP`)
        .bind(policyId, input.workspaceId, `${title} public access`, access, access === "authenticated" ? "verified" : "anonymous", JSON.stringify({ contributionId: input.contributionId, contributionKind: input.contributionKind }), JSON.stringify([input.contributionId])),
      this.db.prepare(`INSERT INTO workspace_publications
        (id, workspace_id, plugin_id, contribution_kind, publication_type, contribution_id, public_path, title, template_id, schema_json, status, policy_id, published_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          public_path = excluded.public_path,
          title = excluded.title,
          publication_type = excluded.publication_type,
          template_id = excluded.template_id,
          schema_json = excluded.schema_json,
          status = 'published',
          policy_id = excluded.policy_id,
          published_at = COALESCE(workspace_publications.published_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP`)
        .bind(publicationId, input.workspaceId, input.pluginId, input.contributionKind, input.contributionKind, input.contributionId, publicPath, title, templateId, schemaJson, policyId),
    ]);
    await this.audit(input.workspaceId, "public.publication.publish", { pluginId: input.pluginId, contributionKind: input.contributionKind, contributionId: input.contributionId, publicPath });
    return { id: publicationId, workspaceId: input.workspaceId, pluginId: input.pluginId, contributionKind: input.contributionKind, contributionId: input.contributionId, publicPath, title, status: "published", policyId, access };
  }

  async publicDelivery(workspaceId: string, publicPath: string): Promise<PublicDelivery | undefined> {
    const row = await this.db.prepare(`SELECT p.id, p.workspace_id, p.plugin_id, p.contribution_kind, p.contribution_id, p.public_path, p.title, p.status, p.policy_id, COALESCE(policy.access, 'anonymous') AS access, installed.manifest_json
      FROM workspace_publications p
      INNER JOIN workspace_plugins active ON active.workspace_id = p.workspace_id AND active.plugin_id = p.plugin_id AND active.active = 1
      INNER JOIN installed_plugins installed ON installed.id = p.plugin_id
      LEFT JOIN public_access_policies policy ON policy.id = p.policy_id
      WHERE p.workspace_id = ? AND p.public_path = ? AND p.status = 'published'
      LIMIT 1`)
      .bind(workspaceId, publicPath)
      .first<{ id: string; workspace_id: string; plugin_id: string; contribution_kind: PublicationKind; contribution_id: string; public_path: string; title: string; status: PublicationStatus; policy_id: string | null; access: PublicContributionAccess; manifest_json: string }>();
    if (!row) return undefined;
    const manifest = pluginManifestSchema.parse(JSON.parse(row.manifest_json));
    const contribution = this.findPublicContribution(manifest, row.contribution_kind, row.contribution_id);
    if (!contribution) return undefined;
    return {
      publication: { id: row.id, workspaceId: row.workspace_id, pluginId: row.plugin_id, contributionKind: row.contribution_kind, contributionId: row.contribution_id, publicPath: row.public_path, title: row.title, status: row.status, policyId: row.policy_id, access: row.access },
      manifest,
      contribution,
    };
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
    if (active) {
      await this.db.prepare(`INSERT OR IGNORE INTO workspace_ui_activations
        (workspace_id, plugin_id, contribution_id, enabled, zone_override, order_index, configuration_json)
        SELECT ?, plugin_id, contribution_id, 1, zone_id, rowid, NULL
        FROM plugin_ui_contributions
        WHERE plugin_id = ? AND access_mode != 'public-candidate'`)
        .bind(workspaceId, pluginId)
        .run();
      await this.db.prepare("UPDATE workspace_ui_activations SET enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId).run();
    } else {
      await this.db.prepare("UPDATE workspace_ui_activations SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId).run();
    }
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

  async workspaceUiSurfaces(workspaceId: string): Promise<SurfaceContribution[]> {
    const rows = await this.db.prepare(`SELECT c.plugin_id, c.contribution_id, c.zone_id, c.template_id, c.schema_json, a.zone_override, a.order_index
      FROM workspace_ui_activations a
      INNER JOIN workspace_plugins wp ON wp.workspace_id = a.workspace_id AND wp.plugin_id = a.plugin_id AND wp.active = 1
      INNER JOIN plugin_ui_contributions c ON c.plugin_id = a.plugin_id AND c.contribution_id = a.contribution_id
      WHERE a.workspace_id = ? AND a.enabled = 1 AND c.access_mode != 'public-candidate'
      ORDER BY a.order_index, c.contribution_id`)
      .bind(workspaceId)
      .all<{ plugin_id: string; contribution_id: string; zone_id: string | null; template_id: string; schema_json: string; zone_override: string | null; order_index: number }>();
    return rows.results.map((row) => {
      const zone = row.zone_override ?? row.zone_id ?? "workspace.main";
      const schema = declarativePageContributionSchema.parse(JSON.parse(row.schema_json));
      const kind = zone.startsWith("settings.") ? "settings" : zone === "assistant.right" ? "panel" : "page";
      return {
        id: row.contribution_id,
        title: schema.title,
        zone,
        kind,
        renderer: { mode: "declarative", schema },
      } satisfies SurfaceContribution;
    });
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
