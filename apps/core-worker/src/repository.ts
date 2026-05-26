import { declarativeUiSchema, pluginManifestSchema, type PluginBundle, type PluginManifest, type PublicContributionAccess, type PublicRouteContribution, type PublicSurfaceContribution, type PublicToolContribution, type SurfaceContribution } from "@v2/plugin-contracts";
import type { SettingScope, WorkspaceLayout } from "@v2/rpc-contracts";
import { declarativePageContributionSchema, publicRoutePatternSchema, settingsPanelContributionSchema, settingsTabContributionSchema, type AccessMode, type DeclarativePageContribution, type SettingsPanelContribution, type SettingsTabContribution } from "@v2/ui-schema";

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
  routePattern?: string;
  routeKind?: "exact" | "parameterized";
  routePriority?: number;
  parameterNames?: string[];
  title: string;
  templateId?: string;
  schema?: DeclarativePageContribution;
  status: PublicationStatus;
  policyId: string | null;
  access: PublicContributionAccess;
  authenticationMode?: "anonymous" | "customer" | "verified";
};
export type PublicDelivery = {
  publication: WorkspacePublication;
  manifest?: PluginManifest | undefined;
  contribution?: PublicContribution | undefined;
  page: DeclarativePageContribution;
  routeParams: Record<string, string>;
};
export type RuntimeContributionResolution = {
  workspaceId: string;
  pluginId: string;
  contributionId: string;
  page: DeclarativePageContribution;
  policy?: { id: string | null; access: PublicContributionAccess; authenticationMode: "anonymous" | "customer" | "verified"; allowedOperations: string[]; enabled: boolean };
};
export type SettingsTabResolution = {
  tab: SettingsTabContribution & { ownerName: string; orderIndex: number };
  panel: SettingsPanelContribution;
};
export type WorkspaceDomain = {
  id: string;
  workspaceId: string;
  hostname: string;
  kind: "admin" | "auth" | "website" | "storefront" | "public-chat";
  status: "draft" | "verifying" | "verified" | "active" | "disabled";
  verificationMethod: "manual" | "dns-txt" | "dns-cname";
  verificationInstructions: Record<string, unknown> | null;
  publicationId: string | null;
  isPrimary: boolean;
  createdAt: string;
  verifiedAt: string | null;
  updatedAt: string;
};
export const workspacePermissions = [
  "workspace.read", "workspace.admin", "workspace.members.manage", "workspace.settings.read", "workspace.settings.write",
  "auth.read", "auth.admin", "auth.method.publish", "auth.policy.write", "auth.ui.publish", "auth.session.read",
  "domains.read", "domains.write", "domains.verify",
  "mail.read", "mail.configure", "mail.test", "mail.template.write",
  "marketplace.read", "marketplace.publish", "plugin.install", "plugin.activate", "plugin.update", "plugin.uninstall", "plugin.grantCapability",
  "approval.read", "tool.approve", "audit.read", "layout.read", "layout.write", "publication.read", "publication.publish",
  "agent.read", "agent.use", "provider.read", "provider.configure",
  "localnode.read", "localnode.configure", "localnode.execute", "production.read", "production.execute", "production.approve",
] as const;
export type WorkspacePermission = typeof workspacePermissions[number];

type PublicDeliveryRow = {
  id: string;
  workspace_id: string;
  plugin_id: string;
  contribution_kind: PublicationKind;
  publication_type: "route" | "surface" | "tool" | "content";
  contribution_id: string;
  public_path: string;
  route_pattern: string;
  route_kind: "exact" | "parameterized";
  route_priority: number;
  parameter_names_json: string | null;
  title: string;
  template_id: string;
  schema_json: string;
  status: PublicationStatus;
  policy_id: string | null;
  access: PublicContributionAccess;
  authentication_mode: "anonymous" | "customer" | "verified";
  policy_enabled: number;
  manifest_json: string;
};

function routeMetadata(pattern: string) {
  const parsed = publicRoutePatternSchema.parse(pattern);
  const parameterNames = parsed.split("/").filter((part) => part.startsWith(":")).map((part) => part.slice(1));
  return {
    pattern: parsed,
    kind: parameterNames.length ? "parameterized" as const : "exact" as const,
    parameterNames,
    staticSegments: parsed.split("/").filter((part) => part && !part.startsWith(":")).length,
  };
}

function matchRoutePattern(pattern: string, path: string): Record<string, string> | undefined {
  const route = routeMetadata(pattern);
  const patternSegments = route.pattern === "/" ? [] : route.pattern.slice(1).split("/");
  const pathSegments = path === "/" ? [] : path.slice(1).split("/");
  if (patternSegments.length !== pathSegments.length) return undefined;
  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const expected = patternSegments[index]!;
    const actual = pathSegments[index]!;
    if (!/^[a-zA-Z0-9_-]+$/.test(actual)) return undefined;
    if (expected.startsWith(":")) params[expected.slice(1)] = actual;
    else if (expected !== actual) return undefined;
  }
  return params;
}

export class CoreRepository {
  constructor(private readonly db: D1Database) {}

  async ensureWorkspace(workspaceId: string, name = "Default Workspace", status: "unprovisioned" | "provisioning" | "active" | "suspended" = "unprovisioned") {
    await this.db.prepare("INSERT OR IGNORE INTO workspaces (id, name, status) VALUES (?, ?, ?)").bind(workspaceId, name, status).run();
  }

  private rolePermissions(systemKey: "owner" | "admin" | "operator" | "viewer"): WorkspacePermission[] {
    if (systemKey === "owner") return [...workspacePermissions];
    if (systemKey === "admin") return workspacePermissions.filter((permission) => !permission.endsWith(".approve") && permission !== "workspace.admin");
    if (systemKey === "operator") return ["workspace.read", "workspace.settings.read", "marketplace.read", "approval.read", "layout.read", "publication.read", "agent.read", "agent.use", "provider.read", "localnode.read", "localnode.execute", "production.read", "production.execute"];
    return ["workspace.read", "workspace.settings.read", "marketplace.read", "approval.read", "layout.read", "publication.read", "agent.read", "provider.read", "localnode.read", "production.read"];
  }

  async ensureWorkspaceRbac(workspaceId: string) {
    await this.ensureWorkspace(workspaceId);
    const roles = [
      ["owner", "Owner", "Full workspace owner permissions"],
      ["admin", "Admin", "Workspace administration without owner recovery permissions"],
      ["operator", "Operator", "Day-to-day operational access"],
      ["viewer", "Viewer", "Read-only workspace access"],
    ] as const;
    const statements = roles.flatMap(([key, name, description]) => {
      const roleId = `${workspaceId}:${key}`;
      return [
        this.db.prepare(`INSERT INTO workspace_roles (id, workspace_id, name, system_key, description, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, system_key = excluded.system_key, description = excluded.description, updated_at = CURRENT_TIMESTAMP`)
          .bind(roleId, workspaceId, name, key, description),
        ...this.rolePermissions(key).map((permission) => this.db.prepare("INSERT OR IGNORE INTO workspace_role_permissions (workspace_id, role_id, permission) VALUES (?, ?, ?)").bind(workspaceId, roleId, permission)),
      ];
    });
    await this.db.batch(statements);
  }

  async bootstrapOwner(workspaceId: string, user: { id: string; email: string; name?: string } | null) {
    if (!user) return;
    await this.ensureWorkspaceRbac(workspaceId);
    const activeMembers = await this.db.prepare("SELECT COUNT(*) AS count FROM workspace_members WHERE workspace_id = ? AND status = 'active'").bind(workspaceId).first<{ count: number }>();
    const alreadyMember = await this.db.prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND status = 'active'").bind(workspaceId, user.id).first<{ user_id: string }>();
    if ((activeMembers?.count ?? 0) > 0 && alreadyMember) return;
    if ((activeMembers?.count ?? 0) === 0) {
      await this.db.batch([
        this.db.prepare(`INSERT INTO workspace_members (workspace_id, user_id, email, status, updated_at)
          VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
          ON CONFLICT(workspace_id, user_id) DO UPDATE SET email = excluded.email, status = 'active', updated_at = CURRENT_TIMESTAMP`)
          .bind(workspaceId, user.id, user.email),
        this.db.prepare("INSERT OR IGNORE INTO workspace_member_roles (workspace_id, user_id, role_id) VALUES (?, ?, ?)").bind(workspaceId, user.id, `${workspaceId}:owner`),
      ]);
      await this.audit(workspaceId, "rbac.bootstrap.owner", { userId: user.id, email: user.email }, user.id);
    }
  }

  async permissionsForUser(workspaceId: string, userId: string): Promise<WorkspacePermission[]> {
    const rows = await this.db.prepare(`SELECT DISTINCT permission
      FROM workspace_role_permissions permissions
      INNER JOIN workspace_member_roles member_roles ON member_roles.workspace_id = permissions.workspace_id AND member_roles.role_id = permissions.role_id
      INNER JOIN workspace_members members ON members.workspace_id = member_roles.workspace_id AND members.user_id = member_roles.user_id AND members.status = 'active'
      WHERE member_roles.workspace_id = ? AND member_roles.user_id = ?
      ORDER BY permission`)
      .bind(workspaceId, userId)
      .all<{ permission: WorkspacePermission }>();
    return rows.results.map((row) => row.permission);
  }

  async hasPermission(workspaceId: string, user: { id: string; email: string } | null, permission: WorkspacePermission): Promise<boolean> {
    if (!user) return false;
    const permissions = await this.permissionsForUser(workspaceId, user.id);
    return permissions.includes(permission) || permissions.includes("workspace.admin");
  }

  async memberSummary(workspaceId: string, user: { id: string; email: string } | null) {
    if (!user) return { user: null, roles: [], permissions: [], bootstrap: false };
    const rows = await this.db.prepare(`SELECT roles.name, roles.system_key
      FROM workspace_member_roles member_roles
      INNER JOIN workspace_roles roles ON roles.workspace_id = member_roles.workspace_id AND roles.id = member_roles.role_id
      WHERE member_roles.workspace_id = ? AND member_roles.user_id = ?
      ORDER BY roles.name`)
      .bind(workspaceId, user.id)
      .all<{ name: string; system_key: string | null }>();
    return { user: { id: user.id, email: user.email }, roles: rows.results, permissions: await this.permissionsForUser(workspaceId, user.id), bootstrap: false };
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
    const surfaces = manifest.contributes.surfaces.flatMap((surface) => {
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
    const settingsTabs = manifest.contributes.settingsTabs.map((tab) => ({
      pluginId: manifest.id,
      contributionId: tab.id,
      contributionType: "menu" as const,
      accessMode: tab.requiredPermission ? "permission-gated" as const : "private" as const,
      zoneId: "settings.tabs",
      templateId: "admin.settings",
      schema: declarativePageContributionSchema.parse({
        id: tab.id,
        title: tab.label,
        templateId: "admin.settings",
        access: tab.requiredPermission ? "permission-gated" : "private",
        data: { settingsTab: tab },
      }),
      requiredPermission: tab.requiredPermission ?? null,
      version: manifest.version,
    }));
    const settingsPanels = manifest.contributes.settingsPanels.map((panel) => ({
      pluginId: manifest.id,
      contributionId: panel.id,
      contributionType: "page" as const,
      accessMode: panel.requiredPermission ? "permission-gated" as const : "private" as const,
      zoneId: `settings.panel.${panel.tabId}`,
      templateId: panel.templateId,
      schema: declarativePageContributionSchema.parse({ ...panel.schema, dataSources: panel.dataSources.length ? panel.dataSources : panel.schema.dataSources, actions: panel.actions.length ? panel.actions : panel.schema.actions }),
      requiredPermission: panel.requiredPermission ?? null,
      version: manifest.version,
    }));
    const explicitTabIds = new Set(manifest.contributes.settingsTabs.map((tab) => tab.id));
    const explicitPanelIds = new Set(manifest.contributes.settingsPanels.map((panel) => panel.id));
    const settingsSurfaceTabs = manifest.contributes.surfaces.filter((surface) => surface.kind === "settings").flatMap((surface, index) => {
      const page = this.declarativeSurfacePage(manifest, surface);
      if (!page) return [];
      const tabId = `${surface.id}.settings-tab`;
      const panelId = `${surface.id}.settings-panel`;
      if (explicitTabIds.has(tabId) || explicitPanelIds.has(panelId)) return [];
      const tab = settingsTabContributionSchema.parse({
        id: tabId,
        pluginId: manifest.id,
        label: surface.title,
        displayOrder: 100 + index * 10,
        category: "plugin",
        panelContributionId: panelId,
        status: "active",
      });
      const panel = settingsPanelContributionSchema.parse({
        id: panelId,
        pluginId: manifest.id,
        tabId,
        templateId: page.templateId === "admin.table" || page.templateId === "admin.form" || page.templateId === "admin.dashboard" ? page.templateId : "admin.settings",
        schema: page,
        dataSources: page.dataSources,
        actions: page.actions,
      });
      return [
        {
          pluginId: manifest.id,
          contributionId: tab.id,
          contributionType: "menu" as const,
          accessMode: "private" as const,
          zoneId: "settings.tabs",
          templateId: "admin.settings",
          schema: declarativePageContributionSchema.parse({
            id: tab.id,
            title: tab.label,
            templateId: "admin.settings",
            access: "private",
            data: { settingsTab: tab },
          }),
          requiredPermission: null,
          version: manifest.version,
        },
        {
          pluginId: manifest.id,
          contributionId: panel.id,
          contributionType: "page" as const,
          accessMode: "private" as const,
          zoneId: `settings.panel.${tab.id}`,
          templateId: panel.templateId,
          schema: page,
          requiredPermission: null,
          version: manifest.version,
        },
      ];
    });
    return [...surfaces, ...settingsTabs, ...settingsPanels, ...settingsSurfaceTabs];
  }

  private platformSettingsTabs(): SettingsTabResolution[] {
    const specs = [
      { id: "platform.settings.general", label: "General", icon: "settings", order: 10, permission: "workspace.settings.read" as const, templateId: "admin.form" as const, dataSourceId: "platform.settings.general.read", actionId: "platform.settings.general.save", fields: [
        { id: "workspaceName", label: "Workspace name", type: "text" as const, required: true },
        { id: "businessDisplayName", label: "Business display name", type: "text" as const },
        { id: "locale", label: "Locale", type: "text" as const },
        { id: "timezone", label: "Timezone", type: "text" as const },
        { id: "currency", label: "Currency", type: "text" as const },
        { id: "contactEmailPublic", label: "Public contact email", type: "email" as const },
        { id: "contactPhonePublic", label: "Public contact phone", type: "text" as const },
        { id: "communicationLanguage", label: "Default communication language", type: "text" as const },
      ], slots: [{ id: "general.status", slot: "header", blocks: [{ type: "text" as const, text: "Workspace metadata, regional defaults, sender status and service health are managed here.", tone: "muted" as const }] }] },
      { id: "platform.settings.security", label: "Security", icon: "shield", order: 20, permission: "auth.admin" as const, templateId: "admin.settings" as const, fields: [], slots: [{ id: "security.summary", slot: "header", blocks: [{ type: "text" as const, text: "Auth methods, registration policy, passkeys, sessions and approvals are protected Auth/Core administration controls.", tone: "muted" as const }] }] },
      { id: "platform.settings.domains", label: "Domains", icon: "globe", order: 30, permission: "domains.read" as const, templateId: "admin.table" as const, dataSourceId: "platform.settings.domains.list", fields: [], slots: [{ id: "domains.boundary", slot: "header", blocks: [{ type: "text" as const, text: "Only verified active domains may become public delivery or Auth trust candidates.", tone: "muted" as const }] }] },
      { id: "platform.settings.marketplace", label: "Marketplace", icon: "package", order: 40, permission: "marketplace.read" as const, templateId: "admin.settings" as const, fields: [], slots: [{ id: "marketplace.lifecycle", slot: "header", blocks: [{ type: "text" as const, text: "Catalog releases, package uploads, installs and persistent approvals live in this platform tab.", tone: "muted" as const }] }] },
      { id: "platform.settings.interface", label: "Interface", icon: "layout", order: 50, permission: "layout.read" as const, templateId: "admin.settings" as const, fields: [], slots: [{ id: "interface.runtime", slot: "header", blocks: [{ type: "text" as const, text: "Shell zones, placements and theme tokens are runtime configuration, not plugin-specific Web code.", tone: "muted" as const }] }] },
    ];
    return specs.map((spec) => {
      const panelId = `${spec.id}.panel`;
      const tab = settingsTabContributionSchema.parse({ id: spec.id, pluginId: "platform", label: spec.label, icon: spec.icon, displayOrder: spec.order, category: "platform", requiredPermission: spec.permission, panelContributionId: panelId, status: "active" });
      const schema = declarativePageContributionSchema.parse({
        id: panelId,
        title: spec.label,
        templateId: spec.templateId,
        access: "private",
        fields: spec.fields,
        slots: spec.slots,
        dataSources: spec.dataSourceId ? [{ id: spec.dataSourceId, title: spec.label, kind: "resource", resource: spec.dataSourceId, access: "permission-gated" }] : [],
        actions: spec.actionId ? [{ id: spec.actionId, title: "Save", commandId: spec.actionId, intent: "submit", variant: "primary", access: "permission-gated" }] : [],
        data: { workspaceName: "Default Workspace", locale: "ro-RO", timezone: "Europe/Bucharest", currency: "RON" },
      });
      const panel = settingsPanelContributionSchema.parse({ id: panelId, pluginId: "platform", tabId: spec.id, templateId: spec.templateId, schema, requiredPermission: spec.permission });
      return { tab: { ...tab, ownerName: "Platform", orderIndex: spec.order }, panel };
    });
  }

  async ensurePlatformSettingsContributions(workspaceId: string) {
    await this.ensureWorkspace(workspaceId);
    const manifest = pluginManifestSchema.parse({ id: "platform", name: "Platform", version: "0.0.0", builtIn: true, contributes: {} });
    await this.db.prepare(`INSERT INTO installed_plugins (id, name, version, manifest_json, worker_isolation, ui_mode, updated_at)
      VALUES ('platform', 'Platform', '0.0.0', ?, 'none', 'declarative', CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET manifest_json = excluded.manifest_json, updated_at = CURRENT_TIMESTAMP`)
      .bind(JSON.stringify(manifest)).run();
    await this.db.prepare(`INSERT INTO workspace_plugins (workspace_id, plugin_id, active, activated_at, updated_at)
      VALUES (?, 'platform', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET active = 1, updated_at = CURRENT_TIMESTAMP`)
      .bind(workspaceId).run();
    const statements = [];
    for (const item of this.platformSettingsTabs()) {
      statements.push(this.db.prepare(`INSERT INTO plugin_ui_contributions
        (id, plugin_id, contribution_id, contribution_type, access_mode, zone_id, template_id, schema_json, required_permission, version, updated_at)
        VALUES (?, 'platform', ?, 'menu', 'private', 'settings.tabs', 'admin.settings', ?, ?, '0.0.0', CURRENT_TIMESTAMP)
        ON CONFLICT(plugin_id, contribution_id, version) DO UPDATE SET schema_json = excluded.schema_json, updated_at = CURRENT_TIMESTAMP`)
        .bind(`platform:${item.tab.id}:0.0.0`, item.tab.id, JSON.stringify(item.tab), item.tab.requiredPermission ?? null));
      statements.push(this.db.prepare(`INSERT INTO plugin_ui_contributions
        (id, plugin_id, contribution_id, contribution_type, access_mode, zone_id, template_id, schema_json, required_permission, version, updated_at)
        VALUES (?, 'platform', ?, 'page', 'private', ?, ?, ?, ?, '0.0.0', CURRENT_TIMESTAMP)
        ON CONFLICT(plugin_id, contribution_id, version) DO UPDATE SET schema_json = excluded.schema_json, template_id = excluded.template_id, updated_at = CURRENT_TIMESTAMP`)
        .bind(`platform:${item.panel.id}:0.0.0`, item.panel.id, `settings.panel.${item.tab.id}`, item.panel.templateId, JSON.stringify(item.panel), item.panel.requiredPermission ?? null));
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO workspace_ui_activations
        (workspace_id, plugin_id, contribution_id, enabled, zone_override, order_index, configuration_json)
        VALUES (?, 'platform', ?, 1, 'settings.tabs', ?, NULL)`)
        .bind(workspaceId, item.tab.id, item.tab.displayOrder));
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO workspace_ui_activations
        (workspace_id, plugin_id, contribution_id, enabled, zone_override, order_index, configuration_json)
        VALUES (?, 'platform', ?, 1, ?, ?, NULL)`)
        .bind(workspaceId, item.panel.id, `settings.panel.${item.tab.id}`, item.tab.displayOrder));
    }
    await this.db.batch(statements);
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

  async workspaceInstalled(workspaceId: string): Promise<PluginManifest[]> {
    await this.ensurePlatformSettingsContributions(workspaceId);
    const rows = await this.db.prepare(`SELECT installed.manifest_json
      FROM workspace_plugins workspace
      INNER JOIN installed_plugins installed ON installed.id = workspace.plugin_id
      WHERE workspace.workspace_id = ? AND workspace.plugin_id != 'platform'
      ORDER BY installed.name`)
      .bind(workspaceId)
      .all<{ manifest_json: string }>();
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
    const uiContribution = await this.pluginUiContribution(input.pluginId, input.contributionId);
    const contribution = this.findPublicContribution(manifest, input.contributionKind, input.contributionId);
    if (!contribution && !uiContribution) return undefined;
    const publicPath = input.publicPath ?? contribution?.path ?? `/${input.contributionId.replace(/[^a-zA-Z0-9/_-]/g, "-")}`;
    const route = routeMetadata(publicPath);
    const title = input.title ?? contribution?.title ?? uiContribution?.schema.title ?? input.contributionId;
    const access = input.access ?? contribution?.access ?? "anonymous";
    const templateId = uiContribution?.templateId ?? "public.contentPage";
    const schemaJson = JSON.stringify(uiContribution?.schema ?? declarativePageContributionSchema.parse({ id: input.contributionId, title, templateId, access: "public-candidate", slots: [{ id: `${input.contributionId}.body`, slot: "body", blocks: [{ type: "text", text: title }] }] }));
    const publicationId = `${input.workspaceId}:${input.pluginId}:${input.contributionKind}:${input.contributionId}`;
    const policyId = `${publicationId}:policy`;
    await this.db.batch([
      this.db.prepare(`INSERT INTO public_access_policies (id, workspace_id, name, access, authentication_mode, rules_json, allowed_operations_json, enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, access = excluded.access, authentication_mode = excluded.authentication_mode, rules_json = excluded.rules_json, allowed_operations_json = excluded.allowed_operations_json, enabled = 1, updated_at = CURRENT_TIMESTAMP`)
        .bind(policyId, input.workspaceId, `${title} public access`, access, access === "authenticated" ? "verified" : "anonymous", JSON.stringify({ contributionId: input.contributionId, contributionKind: input.contributionKind }), JSON.stringify([input.contributionId])),
      this.db.prepare(`INSERT INTO workspace_publications
        (id, workspace_id, plugin_id, contribution_kind, publication_type, contribution_id, public_path, route_pattern, route_priority, route_kind, parameter_names_json, title, template_id, schema_json, status, policy_id, published_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          public_path = excluded.public_path,
          route_pattern = excluded.route_pattern,
          route_priority = excluded.route_priority,
          route_kind = excluded.route_kind,
          parameter_names_json = excluded.parameter_names_json,
          title = excluded.title,
          publication_type = excluded.publication_type,
          template_id = excluded.template_id,
          schema_json = excluded.schema_json,
          status = 'published',
          policy_id = excluded.policy_id,
          published_at = COALESCE(workspace_publications.published_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP`)
        .bind(publicationId, input.workspaceId, input.pluginId, input.contributionKind, input.contributionKind, input.contributionId, publicPath, route.pattern, 0, route.kind, JSON.stringify(route.parameterNames), title, templateId, schemaJson, policyId),
    ]);
    await this.audit(input.workspaceId, "public.publication.publish", { pluginId: input.pluginId, contributionKind: input.contributionKind, contributionId: input.contributionId, publicPath });
    return { id: publicationId, workspaceId: input.workspaceId, pluginId: input.pluginId, contributionKind: input.contributionKind, publicationType: input.contributionKind, contributionId: input.contributionId, publicPath, routePattern: route.pattern, routeKind: route.kind, routePriority: 0, parameterNames: route.parameterNames, title, templateId, schema: JSON.parse(schemaJson) as DeclarativePageContribution, status: "published", policyId, access };
  }

  async publicDelivery(workspaceId: string, publicPath: string): Promise<PublicDelivery | undefined> {
    const exact = await this.db.prepare(`SELECT p.id, p.workspace_id, p.plugin_id, p.contribution_kind, p.publication_type, p.contribution_id, p.public_path, p.route_pattern, p.route_kind, p.route_priority, p.parameter_names_json, p.title, p.template_id, p.schema_json, p.status, p.policy_id, COALESCE(policy.access, 'anonymous') AS access, COALESCE(policy.authentication_mode, 'anonymous') AS authentication_mode, COALESCE(policy.enabled, 1) AS policy_enabled, installed.manifest_json
      FROM workspace_publications p
      INNER JOIN workspace_plugins active ON active.workspace_id = p.workspace_id AND active.plugin_id = p.plugin_id AND active.active = 1
      INNER JOIN installed_plugins installed ON installed.id = p.plugin_id
      LEFT JOIN public_access_policies policy ON policy.id = p.policy_id
      WHERE p.workspace_id = ? AND p.public_path = ? AND p.route_kind = 'exact' AND p.status = 'published' AND COALESCE(policy.enabled, 1) = 1
      ORDER BY p.route_priority DESC
      LIMIT 1`)
      .bind(workspaceId, publicPath)
      .first<PublicDeliveryRow>();
    const candidates = exact ? [] : (await this.db.prepare(`SELECT p.id, p.workspace_id, p.plugin_id, p.contribution_kind, p.publication_type, p.contribution_id, p.public_path, p.route_pattern, p.route_kind, p.route_priority, p.parameter_names_json, p.title, p.template_id, p.schema_json, p.status, p.policy_id, COALESCE(policy.access, 'anonymous') AS access, COALESCE(policy.authentication_mode, 'anonymous') AS authentication_mode, COALESCE(policy.enabled, 1) AS policy_enabled, installed.manifest_json
      FROM workspace_publications p
      INNER JOIN workspace_plugins active ON active.workspace_id = p.workspace_id AND active.plugin_id = p.plugin_id AND active.active = 1
      INNER JOIN installed_plugins installed ON installed.id = p.plugin_id
      LEFT JOIN public_access_policies policy ON policy.id = p.policy_id
      WHERE p.workspace_id = ? AND p.route_kind = 'parameterized' AND p.status = 'published' AND COALESCE(policy.enabled, 1) = 1`)
      .bind(workspaceId)
      .all<PublicDeliveryRow>()).results
      .map((row) => ({ row, params: matchRoutePattern(row.route_pattern, publicPath), meta: routeMetadata(row.route_pattern) }))
      .filter((item): item is { row: PublicDeliveryRow; params: Record<string, string>; meta: ReturnType<typeof routeMetadata> } => Boolean(item.params))
      .sort((left, right) => right.meta.staticSegments - left.meta.staticSegments || left.meta.parameterNames.length - right.meta.parameterNames.length || right.row.route_priority - left.row.route_priority);
    const matched = exact ? { row: exact, params: {} } : candidates[0];
    if (!matched) return undefined;
    const row = matched.row;
    const manifest = pluginManifestSchema.parse(JSON.parse(row.manifest_json));
    const contribution = this.findPublicContribution(manifest, row.contribution_kind, row.contribution_id);
    const page = declarativePageContributionSchema.parse(JSON.parse(row.schema_json));
    return {
      publication: { id: row.id, workspaceId: row.workspace_id, pluginId: row.plugin_id, contributionKind: row.contribution_kind, publicationType: row.publication_type, contributionId: row.contribution_id, publicPath: row.public_path, routePattern: row.route_pattern, routeKind: row.route_kind, routePriority: row.route_priority, parameterNames: row.parameter_names_json ? JSON.parse(row.parameter_names_json) as string[] : [], title: row.title, templateId: row.template_id, schema: page, status: row.status, policyId: row.policy_id, access: row.access, authenticationMode: row.authentication_mode },
      manifest,
      contribution,
      page,
      routeParams: matched.params,
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
    await this.ensurePlatformSettingsContributions(workspaceId);
    const rows = await this.db.prepare("SELECT plugin_id FROM workspace_plugins WHERE workspace_id = ? AND active = 1 AND plugin_id != 'platform'").bind(workspaceId).all<{ plugin_id: string }>();
    return rows.results.map((row) => row.plugin_id);
  }

  async workspacePlugins(workspaceId: string): Promise<PluginWorkspaceState[]> {
    await this.ensurePlatformSettingsContributions(workspaceId);
    const rows = await this.db.prepare("SELECT workspace_id, plugin_id, active, updated_at FROM workspace_plugins WHERE workspace_id = ? AND plugin_id != 'platform'").bind(workspaceId).all<{ workspace_id: string; plugin_id: string; active: number; updated_at: string }>();
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

  async privateRuntimeContribution(workspaceId: string, contributionId: string): Promise<RuntimeContributionResolution | undefined> {
    const row = await this.db.prepare(`SELECT c.plugin_id, c.contribution_id, c.schema_json
      FROM workspace_ui_activations a
      INNER JOIN workspace_plugins wp ON wp.workspace_id = a.workspace_id AND wp.plugin_id = a.plugin_id AND wp.active = 1
      INNER JOIN plugin_ui_contributions c ON c.plugin_id = a.plugin_id AND c.contribution_id = a.contribution_id
      WHERE a.workspace_id = ? AND a.contribution_id = ? AND a.enabled = 1 AND c.access_mode != 'public-candidate'
      ORDER BY a.order_index
      LIMIT 1`)
      .bind(workspaceId, contributionId)
      .first<{ plugin_id: string; contribution_id: string; schema_json: string }>();
    return row ? { workspaceId, pluginId: row.plugin_id, contributionId: row.contribution_id, page: declarativePageContributionSchema.parse(JSON.parse(row.schema_json)) } : undefined;
  }

  async settingsTabs(workspaceId: string): Promise<Array<SettingsTabResolution["tab"]>> {
    await this.ensurePlatformSettingsContributions(workspaceId);
    const rows = await this.db.prepare(`SELECT c.plugin_id, c.schema_json, a.order_index, installed.name AS owner_name
      FROM workspace_ui_activations a
      INNER JOIN workspace_plugins wp ON wp.workspace_id = a.workspace_id AND wp.plugin_id = a.plugin_id AND wp.active = 1
      INNER JOIN plugin_ui_contributions c ON c.plugin_id = a.plugin_id AND c.contribution_id = a.contribution_id
      INNER JOIN installed_plugins installed ON installed.id = c.plugin_id
      WHERE a.workspace_id = ? AND a.enabled = 1 AND c.contribution_type = 'menu' AND COALESCE(a.zone_override, c.zone_id) = 'settings.tabs'
      ORDER BY a.order_index, c.contribution_id`)
      .bind(workspaceId)
      .all<{ plugin_id: string; schema_json: string; order_index: number; owner_name: string }>();
    return rows.results.map((row) => {
      const raw = JSON.parse(row.schema_json) as unknown;
      const tab = settingsTabContributionSchema.safeParse(raw);
      if (tab.success) return { ...tab.data, ownerName: row.owner_name, orderIndex: row.order_index };
      const page = declarativePageContributionSchema.parse(raw);
      return { ...settingsTabContributionSchema.parse((page.data as { settingsTab?: unknown }).settingsTab), ownerName: row.owner_name, orderIndex: row.order_index };
    });
  }

  async settingsTab(workspaceId: string, tabId: string): Promise<SettingsTabResolution | undefined> {
    const tabs = await this.settingsTabs(workspaceId);
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab || tab.status !== "active") return undefined;
    const row = await this.db.prepare(`SELECT c.schema_json
      FROM workspace_ui_activations a
      INNER JOIN workspace_plugins wp ON wp.workspace_id = a.workspace_id AND wp.plugin_id = a.plugin_id AND wp.active = 1
      INNER JOIN plugin_ui_contributions c ON c.plugin_id = a.plugin_id AND c.contribution_id = a.contribution_id
      WHERE a.workspace_id = ? AND a.enabled = 1 AND a.contribution_id = ? AND c.contribution_type = 'page'
      LIMIT 1`)
      .bind(workspaceId, tab.panelContributionId)
      .first<{ schema_json: string }>();
    if (!row) return undefined;
    const raw = JSON.parse(row.schema_json) as unknown;
    const panel = settingsPanelContributionSchema.safeParse(raw);
    if (panel.success) return { tab, panel: panel.data };
    const page = declarativePageContributionSchema.parse(raw);
    return { tab, panel: settingsPanelContributionSchema.parse({ id: tab.panelContributionId, pluginId: tab.pluginId, tabId: tab.id, templateId: page.templateId, schema: page, dataSources: page.dataSources, actions: page.actions, requiredPermission: tab.requiredPermission }) };
  }

  async reorderSettingsTabs(workspaceId: string, tabIds: string[]) {
    await this.ensurePlatformSettingsContributions(workspaceId);
    await this.db.batch(tabIds.map((tabId, index) => this.db.prepare(`UPDATE workspace_ui_activations SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND contribution_id = ?`).bind(index * 10, workspaceId, tabId)));
    await this.audit(workspaceId, "settings.tabs.order", { tabIds });
  }

  async publicRuntimeContribution(workspaceId: string, contributionId: string): Promise<RuntimeContributionResolution | undefined> {
    const row = await this.db.prepare(`SELECT p.workspace_id, p.plugin_id, p.contribution_id, p.schema_json, p.policy_id, COALESCE(policy.access, 'anonymous') AS access, COALESCE(policy.authentication_mode, 'anonymous') AS authentication_mode, COALESCE(policy.allowed_operations_json, '[]') AS allowed_operations_json, COALESCE(policy.enabled, 1) AS policy_enabled
      FROM workspace_publications p
      INNER JOIN workspace_plugins active ON active.workspace_id = p.workspace_id AND active.plugin_id = p.plugin_id AND active.active = 1
      LEFT JOIN public_access_policies policy ON policy.id = p.policy_id
      WHERE p.workspace_id = ? AND p.contribution_id = ? AND p.status = 'published' AND COALESCE(policy.enabled, 1) = 1
      LIMIT 1`)
      .bind(workspaceId, contributionId)
      .first<{ workspace_id: string; plugin_id: string; contribution_id: string; schema_json: string; policy_id: string | null; access: PublicContributionAccess; authentication_mode: "anonymous" | "customer" | "verified"; allowed_operations_json: string; policy_enabled: number }>();
    return row ? {
      workspaceId: row.workspace_id,
      pluginId: row.plugin_id,
      contributionId: row.contribution_id,
      page: declarativePageContributionSchema.parse(JSON.parse(row.schema_json)),
      policy: { id: row.policy_id, access: row.access, authenticationMode: row.authentication_mode, allowedOperations: JSON.parse(row.allowed_operations_json) as string[], enabled: row.policy_enabled === 1 },
    } : undefined;
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

  async generalSettings(workspaceId: string) {
    await this.ensureWorkspace(workspaceId);
    const workspace = await this.db.prepare("SELECT name FROM workspaces WHERE id = ?").bind(workspaceId).first<{ name: string }>();
    const settings = await this.listSettings(workspaceId, "platform");
    return {
      workspaceName: settings.workspaceName ?? workspace?.name ?? "Default Workspace",
      businessDisplayName: settings.businessDisplayName ?? "",
      locale: settings.locale ?? "ro-RO",
      timezone: settings.timezone ?? "Europe/Bucharest",
      currency: settings.currency ?? "RON",
      contactEmailPublic: settings.contactEmailPublic ?? "",
      contactPhonePublic: settings.contactPhonePublic ?? "",
      communicationLanguage: settings.communicationLanguage ?? "ro-RO",
      emailDeliveryStatus: "unavailable",
      serviceHealth: { core: "ok", auth: "external", marketplace: "ok" },
    };
  }

  async saveGeneralSettings(workspaceId: string, input: Record<string, unknown>, actorId?: string) {
    const allowed = ["workspaceName", "businessDisplayName", "locale", "timezone", "currency", "contactEmailPublic", "contactPhonePublic", "communicationLanguage"];
    await this.ensureWorkspace(workspaceId);
    const statements = allowed.map((key) => this.db.prepare("INSERT INTO workspace_settings (workspace_id, scope, key, value_json, updated_at) VALUES (?, 'platform', ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, scope, key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind(workspaceId, key, JSON.stringify(input[key] ?? "")));
    if (typeof input.workspaceName === "string" && input.workspaceName.trim()) statements.push(this.db.prepare("UPDATE workspaces SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(input.workspaceName.trim(), workspaceId));
    await this.db.batch(statements);
    await this.audit(workspaceId, "settings.general.save", { keys: allowed }, actorId);
    return this.generalSettings(workspaceId);
  }

  private domainRow(row: { id: string; workspace_id: string; hostname: string; kind: WorkspaceDomain["kind"]; status: WorkspaceDomain["status"]; verification_method: WorkspaceDomain["verificationMethod"]; verification_instructions_json: string | null; publication_id: string | null; is_primary: number; created_at: string; verified_at: string | null; updated_at: string }): WorkspaceDomain {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      hostname: row.hostname,
      kind: row.kind,
      status: row.status,
      verificationMethod: row.verification_method,
      verificationInstructions: row.verification_instructions_json ? JSON.parse(row.verification_instructions_json) as Record<string, unknown> : null,
      publicationId: row.publication_id,
      isPrimary: row.is_primary === 1,
      createdAt: row.created_at,
      verifiedAt: row.verified_at,
      updatedAt: row.updated_at,
    };
  }

  async listDomains(workspaceId: string): Promise<WorkspaceDomain[]> {
    const rows = await this.db.prepare(`SELECT id, workspace_id, hostname, kind, status, verification_method, verification_instructions_json, publication_id, is_primary, created_at, verified_at, updated_at
      FROM workspace_domains WHERE workspace_id = ? ORDER BY kind, hostname`).bind(workspaceId).all<Parameters<typeof this.domainRow>[0]>();
    return rows.results.map((row) => this.domainRow(row));
  }

  async createDomain(workspaceId: string, input: { hostname: string; kind: WorkspaceDomain["kind"]; verificationMethod?: WorkspaceDomain["verificationMethod"]; isPrimary?: boolean }, actorId?: string) {
    await this.ensureWorkspace(workspaceId);
    const hostname = input.hostname.trim().toLowerCase();
    const token = crypto.randomUUID();
    const instructions = { method: input.verificationMethod ?? "manual", txtRecord: `_v2-verify.${hostname}`, token };
    await this.db.prepare(`INSERT INTO workspace_domains
      (id, workspace_id, hostname, kind, status, verification_method, verification_token_hash, verification_instructions_json, is_primary, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(crypto.randomUUID(), workspaceId, hostname, input.kind, input.verificationMethod ?? "manual", await this.sha256(token), JSON.stringify(instructions), input.isPrimary ? 1 : 0)
      .run();
    await this.audit(workspaceId, "domain.create", { hostname, kind: input.kind }, actorId);
    return this.listDomains(workspaceId);
  }

  async updateDomainStatus(workspaceId: string, domainId: string, status: WorkspaceDomain["status"], actorId?: string) {
    const verifiedAt = status === "verified" || status === "active" ? ", verified_at = COALESCE(verified_at, CURRENT_TIMESTAMP)" : "";
    await this.db.prepare(`UPDATE workspace_domains SET status = ?, updated_at = CURRENT_TIMESTAMP${verifiedAt} WHERE workspace_id = ? AND id = ?`).bind(status, workspaceId, domainId).run();
    await this.audit(workspaceId, `domain.${status}`, { domainId }, actorId);
    return this.listDomains(workspaceId);
  }

  private async sha256(value: string) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
