import { declarativeUiSchema, pluginManifestSchema, type PluginBundle, type PluginManifest, type PublicContributionAccess, type PublicRouteContribution, type PublicSurfaceContribution, type PublicToolContribution, type SurfaceContribution } from "@v2/plugin-contracts";
import type { MailDeliveryResult, MailMessageRequest, MailProviderConfigure, MailProviderPublicSummary, MailTemplate } from "@v2/mail-contracts";
import type { SettingScope, WorkspaceLayout } from "@v2/rpc-contracts";
import { actionDefinitionSchema, columnDefinitionSchema, declarativePageContributionSchema, fieldDefinitionSchema, publicRoutePatternSchema, settingsPanelContributionSchema, settingsSectionSchema, settingsTabContributionSchema, type AccessMode, type DeclarativePageContribution, type SettingsPanelContribution, type SettingsSection, type SettingsTabContribution } from "@v2/ui-schema";
import type { CoreEnv } from "./env";

export type PluginWorkspaceState = {
  workspaceId: string;
  pluginId: string;
  active: boolean;
  updatedAt: string;
};

export type PluginRuntimeDeployment = {
  workspaceId: string;
  pluginId: string;
  releaseId: string;
  runtimeKey: string;
  runtimeKind: "dispatch-namespace" | "local-dev" | "none";
  runtimeStatus: "pending" | "provisioning" | "deployed" | "active" | "failed" | "disabled" | "deleted";
  deployedVersion: string | null;
  deploymentId: string | null;
  createdAt: string;
  activatedAt: string | null;
  disabledAt: string | null;
  lastError: string | null;
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

function publicSurfaceId(contribution: PublicContribution | undefined): string | undefined {
  if (!contribution || !("surfaceId" in contribution)) return undefined;
  return typeof contribution.surfaceId === "string" ? contribution.surfaceId : undefined;
}
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
export type WorkspacePublicationRecord = WorkspacePublication & {
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string;
};
export type WorkspaceRoleRecord = {
  id: string;
  name: string;
  systemKey: string | null;
  description: string | null;
  permissions: string[];
};
export type WorkspaceMemberRecord = {
  user: { id: string; email: string | null };
  status: "active" | "invited" | "disabled";
  roles: Array<{ id: string; name: string; systemKey: string | null }>;
  permissions: WorkspacePermission[];
  overrides: Array<{ permission: WorkspacePermission; effect: "allow" | "deny" }>;
};
export type PlanRecord = {
  id: string;
  name: string;
  status: "active" | "draft" | "disabled";
  limits: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
export type UserPlanAssignmentRecord = {
  id: string;
  userId: string;
  planId: string;
  status: "active" | "scheduled" | "expired" | "disabled";
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  requiredPermission: string | null;
  policy?: { id: string | null; access: PublicContributionAccess; authenticationMode: "anonymous" | "customer" | "verified"; allowedOperations: string[]; enabled: boolean };
};
export type SettingsTabResolution = {
  tab: SettingsTabContribution & { ownerName: string; orderIndex: number };
  panel: SettingsPanelContribution;
};
export type AccessibleWorkspace = {
  id: string;
  name: string;
  status: "unprovisioned" | "provisioning" | "active" | "suspended";
  roles: Array<{ name: string; system_key: string | null }>;
  permissions: WorkspacePermission[];
};
export type WorkspaceDomain = {
  id: string;
  workspaceId: string;
  hostname: string;
  kind: "admin" | "auth" | "website" | "storefront" | "public-chat" | "mail";
  status: "draft" | "verifying" | "verified" | "active" | "disabled";
  verificationMethod: "manual" | "dns-txt" | "dns-cname";
  verificationInstructions: Record<string, unknown> | null;
  publicationId: string | null;
  isPrimary: boolean;
  createdAt: string;
  verifiedAt: string | null;
  updatedAt: string;
};
type MailProviderRow = {
  id: string;
  workspace_id: string;
  kind: MailProviderPublicSummary["kind"];
  label: string;
  status: MailProviderPublicSummary["status"];
  enabled: number;
  from_name: string;
  from_email: string;
  reply_to_email: string | null;
  configuration_ref: string | null;
  safe_config_json: string;
  is_default_transactional: number;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
export const workspacePermissions = [
  "workspace.read", "workspace.admin", "workspace.members.manage", "workspace.settings.read", "workspace.settings.write", "workspace.impersonate",
  "auth.read", "auth.admin", "auth.method.publish", "auth.policy.write", "auth.ui.publish", "auth.session.read",
  "domains.read", "domains.write", "domains.verify",
  "mail.read", "mail.configure", "mail.test", "mail.template.write",
  "marketplace.read", "marketplace.publish", "plugin.install", "plugin.activate", "plugin.update", "plugin.uninstall", "plugin.grantCapability",
  "approval.read", "tool.approve", "audit.read", "layout.read", "layout.write", "publication.read", "publication.publish",
  "plan.read", "plan.write",
  "agent.read", "agent.use", "provider.read", "provider.configure",
  "localnode.read", "localnode.configure", "localnode.execute", "production.read", "production.execute", "production.approve",
] as const;
export type WorkspacePermission = string;
type MailSecretConfig = { endpoint?: string; token?: string; headers?: Record<string, string> };
type MailDeliveryAdapterResult = { ok: boolean; providerMessageId?: string; errorSafe?: string };

function interpolate(template: string, variables: Record<string, string>) {
  return template.replaceAll(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_match, key: string) => variables[key] ?? "");
}

function parseSecretConfigs(env?: Pick<CoreEnv, "MAIL_PROVIDER_CONFIGS_JSON">): Record<string, MailSecretConfig> {
  if (!env?.MAIL_PROVIDER_CONFIGS_JSON) return {};
  try {
    const parsed = JSON.parse(env.MAIL_PROVIDER_CONFIGS_JSON) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, MailSecretConfig>;
  } catch {
    return {};
  }
}

class CoreMailDeliveryAdapter {
  constructor(private readonly env?: Pick<CoreEnv, "ENVIRONMENT" | "MAIL_PROVIDER_CONFIGS_JSON">) {}

  async deliver(provider: MailProviderPublicSummary & { configurationRef: string | null }, message: MailMessageRequest & { subject: string; text: string; html?: string }): Promise<MailDeliveryAdapterResult> {
    if (provider.kind === "mock-development-only") {
      if (this.env?.ENVIRONMENT === "production") return { ok: false, errorSafe: "Development-only mail providers are disabled in production." };
      return { ok: true, providerMessageId: `mock:${crypto.randomUUID()}` };
    }
    if (provider.kind === "smtp") {
      return { ok: false, errorSafe: "Direct SMTP delivery is not available in the Worker runtime. Configure a transactional-http provider." };
    }
    if (!provider.configurationRef) return { ok: false, errorSafe: "Mail provider secret reference is not configured." };
    const secret = parseSecretConfigs(this.env)[provider.configurationRef];
    if (!secret?.endpoint) return { ok: false, errorSafe: "Mail provider secret reference cannot be resolved server-side." };
    const headers = new Headers({ "content-type": "application/json", ...(secret.headers ?? {}) });
    if (secret.token) headers.set("authorization", `Bearer ${secret.token}`);
    try {
      const response = await fetch(secret.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: { name: provider.fromName, email: provider.fromEmail },
          replyTo: provider.replyToEmail,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html ?? null,
          purpose: message.purpose,
          templateKey: message.templateKey ?? null,
          variables: message.variables,
        }),
      });
      if (!response.ok) return { ok: false, errorSafe: `Mail provider rejected delivery with HTTP ${response.status}.` };
      const body = await response.json().catch(() => ({})) as { id?: unknown; messageId?: unknown; status?: unknown; accepted?: unknown };
      const accepted = body.accepted === true || body.status === "sent" || body.status === "queued" || typeof body.id === "string" || typeof body.messageId === "string";
      if (!accepted) return { ok: false, errorSafe: "Mail provider response did not confirm delivery acceptance." };
      const providerMessageId = String(body.messageId ?? body.id ?? "");
      return providerMessageId ? { ok: true, providerMessageId } : { ok: true };
    } catch {
      return { ok: false, errorSafe: "Mail provider delivery request failed." };
    }
  }
}

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
type WorkspacePublicationRow = {
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
  created_at: string;
  published_at: string | null;
  updated_at: string;
};
type PublicAccessPolicyRow = {
  id: string;
  workspace_id: string;
  name: string;
  access: PublicContributionAccess;
  authentication_mode: "anonymous" | "customer" | "verified";
  rules_json: string | null;
  allowed_operations_json: string;
  enabled: number;
};
type AuditEventRow = {
  id: string;
  workspace_id: string | null;
  actor_id: string | null;
  action: string;
  payload_json: string | null;
  created_at: string;
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
  constructor(private readonly db: D1Database, private readonly env?: Pick<CoreEnv, "ENVIRONMENT" | "MAIL_PROVIDER_CONFIGS_JSON">) {}

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

  async createOwnerProvisioningRequest(input: { workspaceId: string; workspaceName: string; ownerEmail: string; tokenHash: string; expiresAt: string; createdBy?: string | null; metadata?: Record<string, unknown> }) {
    await this.ensureWorkspaceRbac(input.workspaceId);
    await this.db.batch([
      this.db.prepare("UPDATE workspaces SET name = ?, status = 'provisioning', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(input.workspaceName, input.workspaceId),
      this.db.prepare("UPDATE workspace_provisioning_requests SET status = 'revoked' WHERE workspace_id = ? AND status = 'pending'").bind(input.workspaceId),
      this.db.prepare(`INSERT INTO workspace_provisioning_requests
        (id, workspace_id, owner_email, status, token_hash, expires_at, created_by, metadata_json)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), input.workspaceId, input.ownerEmail.toLowerCase(), input.tokenHash, input.expiresAt, input.createdBy ?? null, JSON.stringify(input.metadata ?? {})),
    ]);
    await this.audit(input.workspaceId, "workspace.provisioning.owner.requested", { ownerEmail: input.ownerEmail.toLowerCase(), expiresAt: input.expiresAt }, input.createdBy ?? undefined);
  }

  async ownerProvisioningStatus(tokenHash: string) {
    const row = await this.db.prepare(`SELECT workspace_id, owner_email, status, expires_at, consumed_at
      FROM workspace_provisioning_requests WHERE token_hash = ? LIMIT 1`)
      .bind(tokenHash)
      .first<{ workspace_id: string; owner_email: string; status: "pending" | "consumed" | "expired" | "revoked"; expires_at: string; consumed_at: string | null }>();
    if (!row) return null;
    const expired = row.status === "pending" && Date.parse(row.expires_at) <= Date.now();
    return { workspaceId: row.workspace_id, ownerEmail: row.owner_email, status: expired ? "expired" as const : row.status, expiresAt: row.expires_at, consumedAt: row.consumed_at };
  }

  async consumeOwnerProvisioningToken(tokenHash: string, user: { id: string; email: string; name?: string } | null) {
    if (!user) return { status: "not_authenticated" as const };
    const row = await this.db.prepare(`SELECT id, workspace_id, owner_email, status, expires_at
      FROM workspace_provisioning_requests WHERE token_hash = ? LIMIT 1`)
      .bind(tokenHash)
      .first<{ id: string; workspace_id: string; owner_email: string; status: "pending" | "consumed" | "expired" | "revoked"; expires_at: string }>();
    if (!row) return { status: "not_found" as const };
    if (row.status !== "pending") return { status: row.status };
    if (Date.parse(row.expires_at) <= Date.now()) {
      await this.db.prepare("UPDATE workspace_provisioning_requests SET status = 'expired' WHERE id = ?").bind(row.id).run();
      return { status: "expired" as const };
    }
    if (row.owner_email.toLowerCase() !== user.email.toLowerCase()) return { status: "email_mismatch" as const };
    await this.ensureWorkspaceRbac(row.workspace_id);
    await this.db.batch([
      this.db.prepare(`INSERT INTO workspace_members (workspace_id, user_id, email, status, updated_at)
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id, user_id) DO UPDATE SET email = excluded.email, status = 'active', updated_at = CURRENT_TIMESTAMP`)
        .bind(row.workspace_id, user.id, user.email),
      this.db.prepare("INSERT OR IGNORE INTO workspace_member_roles (workspace_id, user_id, role_id) VALUES (?, ?, ?)").bind(row.workspace_id, user.id, `${row.workspace_id}:owner`),
      this.db.prepare("UPDATE workspace_provisioning_requests SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'").bind(row.id),
      this.db.prepare("UPDATE workspaces SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.workspace_id),
    ]);
    await this.audit(row.workspace_id, "workspace.provisioning.owner.consumed", { userId: user.id, email: user.email }, user.id);
    return { status: "consumed" as const, workspaceId: row.workspace_id };
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

  async memberPermissionOverrides(workspaceId: string, userId: string) {
    const rows = await this.db.prepare("SELECT permission, effect FROM workspace_member_permission_overrides WHERE workspace_id = ? AND user_id = ? ORDER BY permission")
      .bind(workspaceId, userId)
      .all<{ permission: WorkspacePermission; effect: "allow" | "deny" }>();
    return rows.results;
  }

  async effectivePermissionsForUser(workspaceId: string, userId: string): Promise<WorkspacePermission[]> {
    const permissions = new Set(await this.permissionsForUser(workspaceId, userId));
    const overrides = await this.memberPermissionOverrides(workspaceId, userId);
    for (const override of overrides) {
      if (override.effect === "deny") permissions.delete(override.permission);
      else permissions.add(override.permission);
    }
    return [...permissions].sort();
  }

  async hasPermission(workspaceId: string, user: { id: string; email: string } | null, permission: WorkspacePermission): Promise<boolean> {
    if (!user) return false;
    const overrides = await this.memberPermissionOverrides(workspaceId, user.id);
    if (overrides.some((override) => override.permission === permission && override.effect === "deny")) return false;
    const permissions = await this.effectivePermissionsForUser(workspaceId, user.id);
    return permissions.includes(permission) || permissions.includes("workspace.admin");
  }

  async hasAllPermissions(workspaceId: string, user: { id: string; email: string } | null, permissions: WorkspacePermission[]): Promise<boolean> {
    if (!permissions.length) return await this.hasPermission(workspaceId, user, "workspace.read");
    if (!user) return false;
    const overrides = await this.memberPermissionOverrides(workspaceId, user.id);
    if (permissions.some((permission) => overrides.some((override) => override.permission === permission && override.effect === "deny"))) return false;
    const granted = new Set(await this.effectivePermissionsForUser(workspaceId, user.id));
    if (granted.has("workspace.admin")) return true;
    return permissions.every((permission) => granted.has(permission));
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
    return { user: { id: user.id, email: user.email }, roles: rows.results, permissions: await this.effectivePermissionsForUser(workspaceId, user.id), bootstrap: false };
  }

  async workspaceMembers(workspaceId: string) {
    const rows = await this.db.prepare(`SELECT members.user_id, members.email, members.status, roles.name, roles.system_key
      FROM workspace_members members
      LEFT JOIN workspace_member_roles member_roles ON member_roles.workspace_id = members.workspace_id AND member_roles.user_id = members.user_id
      LEFT JOIN workspace_roles roles ON roles.workspace_id = member_roles.workspace_id AND roles.id = member_roles.role_id
      WHERE members.workspace_id = ?
      ORDER BY members.updated_at DESC, members.email, roles.name`)
      .bind(workspaceId)
      .all<{ user_id: string; email: string | null; status: "active" | "invited" | "disabled"; name: string | null; system_key: string | null }>();
    const members = new Map<string, { user: { id: string; email: string | null; name: string | null }; status: "active" | "invited" | "disabled"; roles: Array<{ name: string; system_key: string | null }>; permissions: WorkspacePermission[] }>();
    for (const row of rows.results) {
      const current = members.get(row.user_id) ?? { user: { id: row.user_id, email: row.email, name: null }, status: row.status, roles: [], permissions: [] };
      if (row.name) current.roles.push({ name: row.name, system_key: row.system_key });
      members.set(row.user_id, current);
    }
    for (const member of members.values()) {
      member.permissions = await this.permissionsForUser(workspaceId, member.user.id);
    }
    return Array.from(members.values());
  }

  async workspaceMemberRecords(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const rows = await this.db.prepare(`SELECT members.user_id, members.email, members.status, roles.id AS role_id, roles.name, roles.system_key
      FROM workspace_members members
      LEFT JOIN workspace_member_roles member_roles ON member_roles.workspace_id = members.workspace_id AND member_roles.user_id = members.user_id
      LEFT JOIN workspace_roles roles ON roles.workspace_id = member_roles.workspace_id AND roles.id = member_roles.role_id
      WHERE members.workspace_id = ?
      ORDER BY members.updated_at DESC, members.email, roles.name`)
      .bind(workspaceId)
      .all<{ user_id: string; email: string | null; status: "active" | "invited" | "disabled"; role_id: string | null; name: string | null; system_key: string | null }>();
    const members = new Map<string, WorkspaceMemberRecord>();
    for (const row of rows.results) {
      const current = members.get(row.user_id) ?? { user: { id: row.user_id, email: row.email }, status: row.status, roles: [], permissions: [], overrides: [] };
      if (row.role_id && row.name) current.roles.push({ id: row.role_id, name: row.name, systemKey: row.system_key });
      members.set(row.user_id, current);
    }
    for (const member of members.values()) {
      member.permissions = await this.effectivePermissionsForUser(workspaceId, member.user.id);
      member.overrides = await this.memberPermissionOverrides(workspaceId, member.user.id);
    }
    return Array.from(members.values());
  }

  async workspaceRoles(workspaceId: string): Promise<WorkspaceRoleRecord[]> {
    const rows = await this.db.prepare(`SELECT roles.id, roles.name, roles.system_key, roles.description
      FROM workspace_roles roles
      WHERE roles.workspace_id = ?
      ORDER BY roles.system_key IS NULL, roles.name`)
      .bind(workspaceId)
      .all<{ id: string; name: string; system_key: string | null; description: string | null }>();
    const result: WorkspaceRoleRecord[] = [];
    for (const role of rows.results) {
      result.push({ id: role.id, name: role.name, systemKey: role.system_key, description: role.description, permissions: await this.rolePermissionsFor(workspaceId, role.id) });
    }
    return result;
  }

  async createWorkspaceRole(workspaceId: string, input: { name: string; description?: string | null }, actorId?: string) {
    const id = `${workspaceId}:${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || crypto.randomUUID()}`;
    await this.ensureWorkspaceRbac(workspaceId);
    await this.db.prepare(`INSERT INTO workspace_roles (id, workspace_id, name, system_key, description, updated_at)
      VALUES (?, ?, ?, NULL, ?, CURRENT_TIMESTAMP)`)
      .bind(id, workspaceId, input.name.trim(), input.description ?? null)
      .run();
    await this.audit(workspaceId, "rbac.role.create", { roleId: id, name: input.name }, actorId);
    return { id, name: input.name.trim(), systemKey: null, description: input.description ?? null, permissions: [] as string[] };
  }

  async updateWorkspaceRole(workspaceId: string, roleId: string, input: { name?: string; description?: string | null }, actorId?: string) {
    const current = await this.db.prepare("SELECT id, name, system_key, description FROM workspace_roles WHERE workspace_id = ? AND id = ? LIMIT 1").bind(workspaceId, roleId).first<{ id: string; name: string; system_key: string | null; description: string | null }>();
    if (!current) return null;
    if (current.system_key) return { ...current, permissions: await this.rolePermissionsFor(workspaceId, roleId) };
    await this.db.prepare("UPDATE workspace_roles SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?")
      .bind(input.name ?? null, input.description ?? null, workspaceId, roleId)
      .run();
    const updated = await this.db.prepare("SELECT id, name, system_key, description FROM workspace_roles WHERE workspace_id = ? AND id = ? LIMIT 1").bind(workspaceId, roleId).first<{ id: string; name: string; system_key: string | null; description: string | null }>();
    if (!updated) return null;
    await this.audit(workspaceId, "rbac.role.update", { roleId, name: updated.name }, actorId);
    return { ...updated, permissions: await this.rolePermissionsFor(workspaceId, roleId) };
  }

  async deleteWorkspaceRole(workspaceId: string, roleId: string, actorId?: string) {
    const current = await this.db.prepare("SELECT system_key FROM workspace_roles WHERE workspace_id = ? AND id = ? LIMIT 1").bind(workspaceId, roleId).first<{ system_key: string | null }>();
    if (!current || current.system_key) return false;
    await this.db.batch([
      this.db.prepare("DELETE FROM workspace_member_roles WHERE workspace_id = ? AND role_id = ?").bind(workspaceId, roleId),
      this.db.prepare("DELETE FROM workspace_role_permissions WHERE workspace_id = ? AND role_id = ?").bind(workspaceId, roleId),
      this.db.prepare("DELETE FROM workspace_roles WHERE workspace_id = ? AND id = ?").bind(workspaceId, roleId),
    ]);
    await this.audit(workspaceId, "rbac.role.delete", { roleId }, actorId);
    return true;
  }

  async setWorkspaceMemberRoles(workspaceId: string, userId: string, roleIds: string[], actorId?: string) {
    await this.ensureWorkspaceRbac(workspaceId);
    await this.db.batch([
      this.db.prepare("DELETE FROM workspace_member_roles WHERE workspace_id = ? AND user_id = ?").bind(workspaceId, userId),
      ...roleIds.map((roleId) => this.db.prepare("INSERT OR IGNORE INTO workspace_member_roles (workspace_id, user_id, role_id) VALUES (?, ?, ?)").bind(workspaceId, userId, roleId)),
    ]);
    await this.audit(workspaceId, "rbac.member.roles.assign", { userId, roleIds }, actorId);
    return this.workspaceMemberRecords(workspaceId);
  }

  async setMemberPermissionOverride(workspaceId: string, userId: string, permission: WorkspacePermission, effect: "allow" | "deny", actorId?: string) {
    await this.ensureWorkspaceRbac(workspaceId);
    await this.db.prepare(`INSERT INTO workspace_member_permission_overrides (workspace_id, user_id, permission, effect, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, user_id, permission) DO UPDATE SET effect = excluded.effect, updated_at = CURRENT_TIMESTAMP`)
      .bind(workspaceId, userId, permission, effect)
      .run();
    await this.audit(workspaceId, "rbac.member.override", { userId, permission, effect }, actorId);
    return this.workspaceMemberRecords(workspaceId);
  }

  async removeMemberPermissionOverride(workspaceId: string, userId: string, permission: WorkspacePermission, actorId?: string) {
    await this.db.prepare("DELETE FROM workspace_member_permission_overrides WHERE workspace_id = ? AND user_id = ? AND permission = ?").bind(workspaceId, userId, permission).run();
    await this.audit(workspaceId, "rbac.member.override.remove", { userId, permission }, actorId);
    return this.workspaceMemberRecords(workspaceId);
  }

  async plans(): Promise<PlanRecord[]> {
    const rows = await this.db.prepare("SELECT id, name, status, limits_json, created_at, updated_at FROM plans ORDER BY name").all<{ id: string; name: string; status: PlanRecord["status"]; limits_json: string; created_at: string; updated_at: string }>();
    return rows.results.map((row) => ({ id: row.id, name: row.name, status: row.status, limits: JSON.parse(row.limits_json || "{}") as Record<string, unknown>, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async upsertPlan(input: { id: string; name: string; status: PlanRecord["status"]; limits: Record<string, unknown> }, actorId?: string) {
    await this.db.prepare(`INSERT INTO plans (id, name, status, limits_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, limits_json = excluded.limits_json, updated_at = CURRENT_TIMESTAMP`)
      .bind(input.id, input.name, input.status, JSON.stringify(input.limits))
      .run();
    await this.audit(null, "plan.upsert", { planId: input.id, status: input.status }, actorId);
    return this.plan(input.id);
  }

  async deletePlan(planId: string, actorId?: string) {
    await this.db.prepare("DELETE FROM user_plan_assignments WHERE plan_id = ?").bind(planId).run();
    await this.db.prepare("DELETE FROM plans WHERE id = ?").bind(planId).run();
    await this.audit(null, "plan.delete", { planId }, actorId);
    return true;
  }

  async plan(planId: string): Promise<PlanRecord | null> {
    const row = await this.db.prepare("SELECT id, name, status, limits_json, created_at, updated_at FROM plans WHERE id = ? LIMIT 1").bind(planId).first<{ id: string; name: string; status: PlanRecord["status"]; limits_json: string; created_at: string; updated_at: string }>();
    if (!row) return null;
    return { id: row.id, name: row.name, status: row.status, limits: JSON.parse(row.limits_json || "{}") as Record<string, unknown>, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async userPlanAssignments(): Promise<UserPlanAssignmentRecord[]> {
    const rows = await this.db.prepare("SELECT id, user_id, plan_id, status, starts_at, ends_at, created_at, updated_at FROM user_plan_assignments ORDER BY created_at DESC").all<{ id: string; user_id: string; plan_id: string; status: UserPlanAssignmentRecord["status"]; starts_at: string | null; ends_at: string | null; created_at: string; updated_at: string }>();
    return rows.results.map((row) => ({ id: row.id, userId: row.user_id, planId: row.plan_id, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async upsertUserPlanAssignment(input: { id?: string; userId: string; planId: string; status: UserPlanAssignmentRecord["status"]; startsAt?: string | null; endsAt?: string | null }, actorId?: string) {
    const id = input.id ?? crypto.randomUUID();
    await this.db.prepare(`INSERT INTO user_plan_assignments (id, user_id, plan_id, status, starts_at, ends_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, plan_id = excluded.plan_id, status = excluded.status, starts_at = excluded.starts_at, ends_at = excluded.ends_at, updated_at = CURRENT_TIMESTAMP`)
      .bind(id, input.userId, input.planId, input.status, input.startsAt ?? null, input.endsAt ?? null)
      .run();
    await this.audit(null, "plan.assignment.upsert", { assignmentId: id, userId: input.userId, planId: input.planId, status: input.status }, actorId);
    return this.userPlanAssignment(id);
  }

  async deleteUserPlanAssignment(id: string, actorId?: string) {
    await this.db.prepare("DELETE FROM user_plan_assignments WHERE id = ?").bind(id).run();
    await this.audit(null, "plan.assignment.delete", { assignmentId: id }, actorId);
    return true;
  }

  async userPlanAssignment(id: string): Promise<UserPlanAssignmentRecord | null> {
    const row = await this.db.prepare("SELECT id, user_id, plan_id, status, starts_at, ends_at, created_at, updated_at FROM user_plan_assignments WHERE id = ? LIMIT 1").bind(id).first<{ id: string; user_id: string; plan_id: string; status: UserPlanAssignmentRecord["status"]; starts_at: string | null; ends_at: string | null; created_at: string; updated_at: string }>();
    if (!row) return null;
    return { id: row.id, userId: row.user_id, planId: row.plan_id, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async accessibleWorkspaces(user: { id: string; email: string } | null): Promise<AccessibleWorkspace[]> {
    if (!user) return [];
    const rows = await this.db.prepare(`SELECT DISTINCT workspaces.id, workspaces.name, workspaces.status
      FROM workspaces
      INNER JOIN workspace_members members ON members.workspace_id = workspaces.id AND members.status = 'active'
      WHERE members.user_id = ?
      ORDER BY workspaces.updated_at DESC, workspaces.name`)
      .bind(user.id)
      .all<{ id: string; name: string; status: AccessibleWorkspace["status"] }>();
    const result: AccessibleWorkspace[] = [];
    for (const workspace of rows.results) {
      const summary = await this.memberSummary(workspace.id, user);
      result.push({ id: workspace.id, name: workspace.name, status: workspace.status, roles: summary.roles, permissions: summary.permissions });
    }
    return result;
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
        requiredPermission: typeof page.data.requiredPermission === "string" ? page.data.requiredPermission : null,
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
    const field = (value: Parameters<typeof fieldDefinitionSchema.parse>[0]) => fieldDefinitionSchema.parse(value);
    const column = (value: Parameters<typeof columnDefinitionSchema.parse>[0]) => columnDefinitionSchema.parse(value);
    const action = (value: Parameters<typeof actionDefinitionSchema.parse>[0]) => actionDefinitionSchema.parse(value);
    const section = (value: Parameters<typeof settingsSectionSchema.parse>[0]) => settingsSectionSchema.parse(value);
    const sectionsByTab = {
      general: [
        section({
          id: "general.workspace",
          title: "Workspace settings",
          description: "Workspace name, language, timezone, currency and branding.",
          kind: "form",
          dataSourceId: "platform.settings.general.read",
          fields: [
            field({ id: "workspaceName", label: "Workspace name", type: "text", required: true }),
            field({ id: "language", label: "Language", type: "text" }),
            field({ id: "timezone", label: "Timezone", type: "text" }),
            field({ id: "defaultCurrency", label: "Default currency", type: "text" }),
            field({ id: "brandingName", label: "Brand name", type: "text" }),
            field({ id: "brandColor", label: "Brand color", type: "color" }),
            field({ id: "contactEmailPublic", label: "Public contact email", type: "email" }),
            field({ id: "contactPhonePublic", label: "Public contact phone", type: "text" }),
          ],
          actions: [action({ id: "platform.settings.general.save", title: "Save", commandId: "platform.settings.general.save", intent: "submit", variant: "primary", placement: "form", access: "permission-gated", requiredPermission: "workspace.settings.write", effects: [{ type: "toast", message: "General settings saved" }, { type: "refresh" }] })],
        }),
      ],
      mail: [
        section({
          id: "mail.provider",
          title: "Mail provider",
          description: "Transactional provider configuration and verification.",
          kind: "form",
          dataSourceId: "platform.settings.mail.summary",
          fields: [
            field({ id: "kind", label: "Provider kind", type: "select", required: true, options: [{ value: "transactional-http", label: "Transactional HTTP" }, { value: "smtp", label: "SMTP" }, { value: "mock-development-only", label: "Mock development only" }] }),
            field({ id: "label", label: "Label", type: "text", required: true }),
            field({ id: "fromName", label: "From name", type: "text", required: true }),
            field({ id: "fromEmail", label: "From email", type: "email", required: true }),
            field({ id: "replyToEmail", label: "Reply-to email", type: "email" }),
            field({ id: "configurationRef", label: "Secret reference", type: "text" }),
          ],
          actions: [action({ id: "platform.settings.mail.provider.save", title: "Save provider", commandId: "platform.settings.mail.provider.save", intent: "submit", variant: "primary", placement: "form", access: "permission-gated", requiredPermission: "mail.configure" })],
        }),
        section({
          id: "mail.providers",
          title: "Providers",
          kind: "table",
          dataSourceId: "platform.settings.mail.providers",
          columns: [
            column({ id: "label", label: "Label", field: "label", type: "text" }),
            column({ id: "kind", label: "Kind", field: "kind", type: "text" }),
            column({ id: "status", label: "Status", field: "status", type: "badge" }),
            column({ id: "fromEmail", label: "From email", field: "fromEmail", type: "text" }),
          ],
          rowActions: [
            action({ id: "platform.settings.mail.provider.activate", title: "Activate", commandId: "platform.settings.mail.provider.activate", variant: "primary", placement: "row", access: "permission-gated", requiredPermission: "mail.configure" }),
            action({ id: "platform.settings.mail.provider.test", title: "Test", commandId: "platform.settings.mail.provider.test", placement: "row", access: "permission-gated", requiredPermission: "mail.test", confirmation: { title: "Send test mail", message: "This will send a test message to the provided address.", reasonRequired: false, fields: [field({ id: "to", label: "Recipient email", type: "email", required: true })] } }),
            action({ id: "platform.settings.mail.provider.disable", title: "Disable", commandId: "platform.settings.mail.provider.disable", variant: "danger", placement: "row", access: "permission-gated", requiredPermission: "mail.configure", confirmation: { title: "Disable provider", reasonRequired: false, fields: [] } }),
          ],
        }),
        section({
          id: "mail.templates",
          title: "Templates",
          kind: "table",
          dataSourceId: "platform.settings.mail.templates",
          columns: [
            column({ id: "templateKey", label: "Template", field: "templateKey", type: "text" }),
            column({ id: "status", label: "Status", field: "status", type: "badge" }),
            column({ id: "locale", label: "Locale", field: "locale", type: "text" }),
            column({ id: "subjectTemplate", label: "Subject", field: "subjectTemplate", type: "text" }),
          ],
        }),
        section({
          id: "mail.events",
          title: "Delivery events",
          kind: "table",
          dataSourceId: "platform.settings.mail.events",
          columns: [
            column({ id: "purpose", label: "Purpose", field: "purpose", type: "text" }),
            column({ id: "status", label: "Status", field: "status", type: "badge" }),
            column({ id: "templateKey", label: "Template", field: "templateKey", type: "text" }),
            column({ id: "errorSafe", label: "Result", field: "errorSafe", type: "text" }),
          ],
        }),
      ],
      security: [
        section({
          id: "security.authentication",
          title: "Authentication",
          description: "Passkeys, email/password and registration policy.",
          kind: "form",
          dataSourceId: "platform.settings.security.bootstrap",
          fields: [
            field({ id: "registrationMode", label: "Registration policy", type: "select", required: true, options: [{ value: "disabled", label: "Disabled" }, { value: "open", label: "Open" }, { value: "invitation-only", label: "Invitation only" }, { value: "admin-created", label: "Admin created" }] }),
            field({ id: "requireEmailVerification", label: "Require email verification", type: "boolean" }),
            field({ id: "allowPasskeyRegistration", label: "Allow passkey registration", type: "boolean" }),
            field({ id: "allowPasskeySignin", label: "Allow passkey sign-in", type: "boolean" }),
          ],
          actions: [action({ id: "platform.settings.security.policy.save", title: "Save policy", commandId: "platform.settings.security.policy.save", intent: "submit", variant: "primary", placement: "form", access: "permission-gated", requiredPermission: "auth.admin" })],
        }),
        section({
          id: "security.roles",
          title: "Roles & permissions",
          kind: "crud",
          dataSourceId: "platform.settings.rbac.roles",
          columns: [
            column({ id: "name", label: "Role", field: "name", type: "text" }),
            column({ id: "systemKey", label: "System", field: "systemKey", type: "text" }),
            column({ id: "description", label: "Description", field: "description", type: "text" }),
            column({ id: "permissions", label: "Permissions", field: "permissions", type: "text" }),
          ],
          fields: [
            field({ id: "name", label: "Name", type: "text", required: true }),
            field({ id: "description", label: "Description", type: "textarea" }),
          ],
          crud: {
            entityLabel: "Role",
            entityLabelPlural: "Roles",
            rowIdField: "id",
            rowTitleField: "name",
            createActionId: "platform.settings.rbac.role.create",
            updateActionId: "platform.settings.rbac.role.update",
            deleteActionId: "platform.settings.rbac.role.delete",
          },
        }),
        section({
          id: "security.members",
          title: "Users & overrides",
          kind: "table",
          dataSourceId: "platform.settings.rbac.members",
          columns: [
            column({ id: "user", label: "User", field: "user", type: "text" }),
            column({ id: "status", label: "Status", field: "status", type: "badge" }),
            column({ id: "roles", label: "Roles", field: "roles", type: "text" }),
            column({ id: "permissions", label: "Permissions", field: "permissions", type: "text" }),
            column({ id: "overrides", label: "Overrides", field: "overrides", type: "text" }),
          ],
          rowActions: [
            action({ id: "platform.settings.rbac.member.impersonate", title: "Impersonate", commandId: "platform.settings.rbac.member.impersonate", variant: "primary", placement: "row", access: "permission-gated", requiredPermission: "workspace.impersonate", confirmation: { title: "Impersonate user", message: "You will switch into the selected user session.", reasonRequired: true, fields: [field({ id: "reason", label: "Reason", type: "textarea", required: true })] }, effects: [{ type: "toast", message: "Impersonation started" }, { type: "closeDialog" }, { type: "navigate", to: "/" }] }),
            action({ id: "platform.settings.rbac.member.override.allow", title: "Allow", commandId: "platform.settings.rbac.member.override.allow", placement: "row", access: "permission-gated", requiredPermission: "workspace.members.manage", confirmation: { title: "Allow permission", reasonRequired: false, fields: [field({ id: "permission", label: "Permission", type: "text", required: true })] } }),
            action({ id: "platform.settings.rbac.member.override.deny", title: "Deny", commandId: "platform.settings.rbac.member.override.deny", variant: "danger", placement: "row", access: "permission-gated", requiredPermission: "workspace.members.manage", confirmation: { title: "Deny permission", reasonRequired: false, fields: [field({ id: "permission", label: "Permission", type: "text", required: true })] } }),
            action({ id: "platform.settings.rbac.member.override.remove", title: "Remove override", commandId: "platform.settings.rbac.member.override.remove", placement: "row", access: "permission-gated", requiredPermission: "workspace.members.manage", confirmation: { title: "Remove override", reasonRequired: false, fields: [field({ id: "permission", label: "Permission", type: "text", required: true })] } }),
          ],
        }),
      ],
      audit: [
        section({
          id: "audit.events",
          title: "Audit log",
          description: "Read-only workspace activity stream.",
          kind: "table",
          dataSourceId: "platform.settings.audit.events",
          columns: [
            column({ id: "actorId", label: "Actor", field: "actorId", type: "text" }),
            column({ id: "action", label: "Action", field: "action", type: "text" }),
            column({ id: "payload", label: "Target / result", field: "payload", type: "text" }),
            column({ id: "createdAt", label: "Time", field: "createdAt", type: "date" }),
          ],
        }),
      ],
      plans: [
        section({
          id: "plans.catalog",
          title: "Plans",
          kind: "crud",
          dataSourceId: "platform.settings.plans.list",
          columns: [
            column({ id: "id", label: "Plan ID", field: "id", type: "text" }),
            column({ id: "name", label: "Name", field: "name", type: "text" }),
            column({ id: "status", label: "Status", field: "status", type: "badge" }),
            column({ id: "limits", label: "Limits", field: "limits", type: "text" }),
          ],
          fields: [
            field({ id: "id", label: "Plan ID", type: "text", required: true }),
            field({ id: "name", label: "Name", type: "text", required: true }),
            field({ id: "status", label: "Status", type: "select", required: true, options: [{ value: "active", label: "Active" }, { value: "draft", label: "Draft" }, { value: "disabled", label: "Disabled" }] }),
            field({ id: "limits", label: "Limits JSON", type: "textarea", required: true }),
          ],
          crud: {
            entityLabel: "Plan",
            entityLabelPlural: "Plans",
            rowIdField: "id",
            rowTitleField: "name",
            createActionId: "platform.settings.plans.upsert",
            updateActionId: "platform.settings.plans.upsert",
            deleteActionId: "platform.settings.plans.delete",
          },
        }),
        section({
          id: "plans.assignments",
          title: "User plan assignments",
          kind: "crud",
          dataSourceId: "platform.settings.plans.assignments",
          columns: [
            column({ id: "userId", label: "User", field: "userId", type: "text" }),
            column({ id: "planId", label: "Plan", field: "planId", type: "text" }),
            column({ id: "status", label: "Status", field: "status", type: "badge" }),
            column({ id: "startsAt", label: "Starts", field: "startsAt", type: "date" }),
            column({ id: "endsAt", label: "Ends", field: "endsAt", type: "date" }),
          ],
          fields: [
            field({ id: "userId", label: "User ID", type: "text", required: true }),
            field({ id: "planId", label: "Plan ID", type: "text", required: true }),
            field({ id: "status", label: "Status", type: "select", required: true, options: [{ value: "active", label: "Active" }, { value: "scheduled", label: "Scheduled" }, { value: "expired", label: "Expired" }, { value: "disabled", label: "Disabled" }] }),
            field({ id: "startsAt", label: "Starts at", type: "date" }),
            field({ id: "endsAt", label: "Ends at", type: "date" }),
          ],
          crud: {
            entityLabel: "Assignment",
            entityLabelPlural: "Assignments",
            rowIdField: "id",
            rowTitleField: "planId",
            createActionId: "platform.settings.plans.assignment.upsert",
            updateActionId: "platform.settings.plans.assignment.upsert",
            deleteActionId: "platform.settings.plans.assignment.delete",
          },
        }),
      ],
      domains: [
        section({
          id: "domains.manage",
          title: "Domains",
          kind: "crud",
          dataSourceId: "platform.settings.domains.list",
          columns: [
            column({ id: "hostname", label: "Hostname", field: "hostname", type: "text" }),
            column({ id: "kind", label: "Kind", field: "kind", type: "text" }),
            column({ id: "status", label: "Status", field: "status", type: "badge" }),
            column({ id: "verificationMethod", label: "Verification", field: "verificationMethod", type: "text" }),
            column({ id: "publicationId", label: "Publication", field: "publicationId", type: "text" }),
          ],
          fields: [
            field({ id: "hostname", label: "Hostname", type: "text", required: true }),
            field({ id: "kind", label: "Kind", type: "select", required: true, options: [{ value: "admin", label: "Admin" }, { value: "auth", label: "Auth" }, { value: "website", label: "Website" }, { value: "storefront", label: "Storefront" }, { value: "public-chat", label: "Public chat" }, { value: "mail", label: "Mail sender" }] }),
            field({ id: "verificationMethod", label: "Verification method", type: "select", required: true, options: [{ value: "manual", label: "Manual" }, { value: "dns-txt", label: "DNS TXT" }, { value: "dns-cname", label: "DNS CNAME" }] }),
            field({ id: "isPrimary", label: "Primary domain", type: "boolean" }),
          ],
          crud: {
            entityLabel: "Domain",
            entityLabelPlural: "Domains",
            rowIdField: "id",
            rowTitleField: "hostname",
            createActionId: "platform.settings.domains.create",
            updateActionId: "platform.settings.domains.create",
            deleteActionId: "platform.settings.domains.delete",
          },
          rowActions: [
            action({ id: "platform.settings.domains.verify", title: "Verify", commandId: "platform.settings.domains.verify", placement: "row", access: "permission-gated", requiredPermission: "domains.verify" }),
            action({ id: "platform.settings.domains.activate", title: "Activate", commandId: "platform.settings.domains.activate", placement: "row", access: "permission-gated", requiredPermission: "domains.write" }),
            action({ id: "platform.settings.domains.disable", title: "Disable", commandId: "platform.settings.domains.disable", variant: "danger", placement: "row", access: "permission-gated", requiredPermission: "domains.write" }),
          ],
        }),
      ],
      plugins: [
        section({
          id: "plugins.installed",
          title: "Installed plugins",
          kind: "table",
          dataSourceId: "platform.settings.plugins.list",
          columns: [
            column({ id: "id", label: "Plugin", field: "id", type: "text" }),
            column({ id: "version", label: "Version", field: "version", type: "text" }),
            column({ id: "active", label: "Active", field: "active", type: "badge" }),
            column({ id: "workerIsolation", label: "Runtime", field: "workerIsolation", type: "text" }),
          ],
          rowActions: [
            action({ id: "platform.settings.plugins.activate", title: "Activate", commandId: "platform.settings.plugins.activate", placement: "row", access: "permission-gated", requiredPermission: "plugin.activate" }),
            action({ id: "platform.settings.plugins.deactivate", title: "Deactivate", commandId: "platform.settings.plugins.deactivate", variant: "danger", placement: "row", access: "permission-gated", requiredPermission: "plugin.activate" }),
          ],
        }),
      ],
      interface: [
        section({
          id: "interface.shell",
          title: "Shell layout",
          description: "Workspace chrome, zones and placements.",
          kind: "summary",
          dataSourceId: "platform.settings.interface.layout",
          actions: [
            action({
              id: "platform.settings.interface.save",
              title: "Save layout",
              commandId: "platform.settings.interface.save",
              intent: "submit",
              variant: "primary",
              placement: "form",
              access: "permission-gated",
              requiredPermission: "layout.write",
            }),
          ],
        }),
      ],
    } satisfies Record<string, SettingsSection[]>;
    const specs = [
      { id: "platform.settings.general", label: "General Settings", icon: "settings", order: 10, permission: "workspace.settings.read" as const, sections: sectionsByTab.general },
      { id: "platform.settings.mail", label: "Mail Provider", icon: "mail", order: 20, permission: "mail.read" as const, sections: sectionsByTab.mail },
      { id: "platform.settings.security", label: "Security", icon: "shield", order: 30, permission: "auth.read" as const, sections: sectionsByTab.security },
      { id: "platform.settings.audit", label: "Audit", icon: "history" as const, order: 40, permission: "audit.read" as const, sections: sectionsByTab.audit },
      { id: "platform.settings.plans", label: "Plans & Limits", icon: "badge-dollar-sign" as const, order: 50, permission: "plan.read" as const, sections: sectionsByTab.plans },
      { id: "platform.settings.domains", label: "Domains", icon: "globe", order: 60, permission: "domains.read" as const, sections: sectionsByTab.domains },
      { id: "platform.settings.plugins", label: "Plugins", icon: "package", order: 70, permission: "marketplace.read" as const, sections: sectionsByTab.plugins },
      { id: "platform.settings.interface", label: "Interface", icon: "layout", order: 80, permission: "layout.read" as const, sections: sectionsByTab.interface },
    ];
    return specs.map((spec) => {
      const panelId = `${spec.id}.panel`;
      const tab = settingsTabContributionSchema.parse({ id: spec.id, pluginId: "platform", label: spec.label, icon: spec.icon, displayOrder: spec.order, category: "platform", requiredPermission: spec.permission, panelContributionId: panelId, status: "active" });
      const schema = declarativePageContributionSchema.parse({
        id: panelId,
        title: spec.label,
        templateId: "admin.settings",
        access: "private",
        slots: [{ id: `${spec.id}.header`, slot: "header", blocks: [{ type: "text", text: `${spec.label} is rendered from schema-driven settings sections.`, tone: "muted" }] }],
        data: {},
      });
      const panel = settingsPanelContributionSchema.parse({ id: panelId, pluginId: "platform", tabId: spec.id, templateId: "admin.settings", schema, sections: spec.sections, requiredPermission: spec.permission });
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
      this.db.prepare("DELETE FROM plugin_permissions WHERE plugin_id = ?").bind(manifest.id),
      this.db.prepare("DELETE FROM plugin_ui_contributions WHERE plugin_id = ? AND version = ?").bind(manifest.id, manifest.version),
      ...manifest.capabilities.map((capability) => this.db.prepare("INSERT INTO plugin_capabilities (plugin_id, capability_id, description, risk) VALUES (?, ?, ?, ?)")
        .bind(manifest.id, capability.id, capability.description ?? null, capability.risk)),
      ...manifest.capabilities.map((capability) => this.db.prepare("INSERT INTO plugin_permissions (plugin_id, permission, description, risk) VALUES (?, ?, ?, ?)")
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

  async publishWorkspaceContribution(input: { workspaceId: string; pluginId: string; contributionKind: PublicationKind; contributionId: string; publicPath?: string | undefined; title?: string | undefined; access?: PublicContributionAccess | undefined }): Promise<WorkspacePublication | undefined> {
    const manifest = await this.installedById(input.pluginId);
    if (!manifest) return undefined;
    const active = await this.activePlugins(input.workspaceId);
    if (!active.includes(input.pluginId)) return undefined;
    const contribution = this.findPublicContribution(manifest, input.contributionKind, input.contributionId);
    const targetContributionId = publicSurfaceId(contribution) ?? input.contributionId;
    const uiContribution = await this.pluginUiContribution(input.pluginId, targetContributionId);
    if (!contribution && !uiContribution) return undefined;
    const publicPath = input.publicPath ?? contribution?.path ?? `/${input.contributionId.replace(/[^a-zA-Z0-9/_-]/g, "-")}`;
    const route = routeMetadata(publicPath);
    const title = input.title ?? contribution?.title ?? uiContribution?.schema.title ?? input.contributionId;
    const access = input.access ?? contribution?.access ?? "anonymous";
    const templateId = uiContribution?.templateId ?? "public.contentPage";
    const schema = uiContribution?.schema ?? declarativePageContributionSchema.parse({ id: input.contributionId, title, templateId, access: "public-candidate", slots: [{ id: `${input.contributionId}.body`, slot: "body", blocks: [{ type: "text", text: title }] }] });
    const schemaJson = JSON.stringify(schema);
    const allowedOperations = [...new Set([input.contributionId, ...schema.dataSources.map((item) => item.id), ...schema.dataSources.flatMap((item) => item.resource ? [item.resource] : []), ...schema.actions.map((item) => item.id), ...schema.actions.map((item) => item.commandId)])];
    const publicationId = `${input.workspaceId}:${input.pluginId}:${input.contributionKind}:${input.contributionId}`;
    const policyId = `${publicationId}:policy`;
    await this.db.batch([
      this.db.prepare(`INSERT INTO public_access_policies (id, workspace_id, name, access, authentication_mode, rules_json, allowed_operations_json, enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, access = excluded.access, authentication_mode = excluded.authentication_mode, rules_json = excluded.rules_json, allowed_operations_json = excluded.allowed_operations_json, enabled = 1, updated_at = CURRENT_TIMESTAMP`)
        .bind(policyId, input.workspaceId, `${title} public access`, access, access === "authenticated" ? "verified" : "anonymous", JSON.stringify({ contributionId: input.contributionId, contributionKind: input.contributionKind }), JSON.stringify(allowedOperations)),
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

  private publicationRow(row: WorkspacePublicationRow): WorkspacePublicationRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      pluginId: row.plugin_id,
      contributionKind: row.contribution_kind,
      publicationType: row.publication_type,
      contributionId: row.contribution_id,
      publicPath: row.public_path,
      routePattern: row.route_pattern,
      routeKind: row.route_kind,
      routePriority: row.route_priority,
      parameterNames: row.parameter_names_json ? JSON.parse(row.parameter_names_json) as string[] : [],
      title: row.title,
      templateId: row.template_id,
      status: row.status,
      policyId: row.policy_id,
      access: row.access,
      authenticationMode: row.authentication_mode,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    };
  }

  async listPublications(workspaceId: string): Promise<WorkspacePublicationRecord[]> {
    const rows = await this.db.prepare(`SELECT p.id, p.workspace_id, p.plugin_id, p.contribution_kind, p.publication_type, p.contribution_id, p.public_path, p.route_pattern, p.route_kind, p.route_priority, p.parameter_names_json, p.title, p.template_id, p.schema_json, p.status, p.policy_id, COALESCE(policy.access, 'anonymous') AS access, COALESCE(policy.authentication_mode, 'anonymous') AS authentication_mode, p.created_at, p.published_at, p.updated_at
      FROM workspace_publications p
      LEFT JOIN public_access_policies policy ON policy.id = p.policy_id
      WHERE p.workspace_id = ?
      ORDER BY p.updated_at DESC, p.created_at DESC`)
      .bind(workspaceId)
      .all<WorkspacePublicationRow>();
    return rows.results.map((row) => this.publicationRow(row));
  }

  async updatePublication(workspaceId: string, publicationId: string, input: { title?: string | undefined; publicPath?: string | undefined; status?: PublicationStatus | undefined; access?: PublicContributionAccess | undefined; authenticationMode?: "anonymous" | "customer" | "verified" | undefined }) {
    const current = await this.db.prepare(`SELECT p.id, p.workspace_id, p.plugin_id, p.contribution_kind, p.publication_type, p.contribution_id, p.public_path, p.route_pattern, p.route_kind, p.route_priority, p.parameter_names_json, p.title, p.template_id, p.schema_json, p.status, p.policy_id, COALESCE(policy.access, 'anonymous') AS access, COALESCE(policy.authentication_mode, 'anonymous') AS authentication_mode, p.created_at, p.published_at, p.updated_at
      FROM workspace_publications p
      LEFT JOIN public_access_policies policy ON policy.id = p.policy_id
      WHERE p.workspace_id = ? AND p.id = ?
      LIMIT 1`)
      .bind(workspaceId, publicationId)
      .first<WorkspacePublicationRow>();
    if (!current) return undefined;
    const nextPath = input.publicPath ?? current.public_path;
    const route = routeMetadata(nextPath);
    const nextTitle = input.title ?? current.title;
    const nextStatus = input.status ?? current.status;
    const nextAccess = input.access ?? current.access;
    const nextAuthenticationMode = input.authenticationMode ?? current.authentication_mode;
    const policyId = current.policy_id ?? `${current.id}:policy`;
    const existingPolicy = current.policy_id ? await this.db.prepare("SELECT id, workspace_id, name, access, authentication_mode, rules_json, allowed_operations_json, enabled FROM public_access_policies WHERE id = ? LIMIT 1").bind(policyId).first<PublicAccessPolicyRow>() : null;
    const rulesJson = existingPolicy?.rules_json ?? JSON.stringify({ contributionId: current.contribution_id, contributionKind: current.contribution_kind });
    const allowedOperationsJson = existingPolicy?.allowed_operations_json ?? JSON.stringify([]);
    await this.db.batch([
      this.db.prepare(`INSERT INTO public_access_policies (id, workspace_id, name, access, authentication_mode, rules_json, allowed_operations_json, enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, access = excluded.access, authentication_mode = excluded.authentication_mode, rules_json = excluded.rules_json, allowed_operations_json = excluded.allowed_operations_json, enabled = 1, updated_at = CURRENT_TIMESTAMP`)
        .bind(policyId, workspaceId, `${nextTitle} public access`, nextAccess, nextAuthenticationMode, rulesJson, allowedOperationsJson),
      this.db.prepare(`UPDATE workspace_publications
        SET public_path = ?, route_pattern = ?, route_kind = ?, parameter_names_json = ?, title = ?, status = ?, policy_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ? AND id = ?`)
        .bind(nextPath, route.pattern, route.kind, JSON.stringify(route.parameterNames), nextTitle, nextStatus, policyId, workspaceId, publicationId),
    ]);
    await this.audit(workspaceId, "public.publication.update", { publicationId, publicPath: nextPath, title: nextTitle, status: nextStatus, access: nextAccess }, undefined);
    const updated = await this.db.prepare(`SELECT p.id, p.workspace_id, p.plugin_id, p.contribution_kind, p.publication_type, p.contribution_id, p.public_path, p.route_pattern, p.route_kind, p.route_priority, p.parameter_names_json, p.title, p.template_id, p.schema_json, p.status, p.policy_id, COALESCE(policy.access, 'anonymous') AS access, COALESCE(policy.authentication_mode, 'anonymous') AS authentication_mode, p.created_at, p.published_at, p.updated_at
      FROM workspace_publications p
      LEFT JOIN public_access_policies policy ON policy.id = p.policy_id
      WHERE p.workspace_id = ? AND p.id = ?
      LIMIT 1`)
      .bind(workspaceId, publicationId)
      .first<WorkspacePublicationRow>();
    return updated ? this.publicationRow(updated) : undefined;
  }

  async deletePublication(workspaceId: string, publicationId: string) {
    const row = await this.db.prepare("SELECT policy_id FROM workspace_publications WHERE workspace_id = ? AND id = ?").bind(workspaceId, publicationId).first<{ policy_id: string | null }>();
    if (!row) return false;
    await this.db.prepare("DELETE FROM workspace_publications WHERE workspace_id = ? AND id = ?").bind(workspaceId, publicationId).run();
    if (row.policy_id) await this.db.prepare("DELETE FROM public_access_policies WHERE id = ?").bind(row.policy_id).run();
    await this.audit(workspaceId, "public.publication.delete", { publicationId });
    return true;
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

  async auditEvents(workspaceId: string): Promise<Array<{ id: string; workspaceId: string | null; actorId: string | null; action: string; payload: Record<string, unknown> | null; createdAt: string }>> {
    const rows = await this.db.prepare(`SELECT id, workspace_id, actor_id, action, payload_json, created_at
      FROM audit_events
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT 50`)
      .bind(workspaceId)
      .all<AuditEventRow>();
    return rows.results.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      actorId: row.actor_id,
      action: row.action,
      payload: row.payload_json ? JSON.parse(row.payload_json) as Record<string, unknown> : null,
      createdAt: row.created_at,
    }));
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
    const manifest = await this.installedById(pluginId);
    if (!manifest) return undefined;
    await this.ensureWorkspace(workspaceId);
    if (active) {
      const deployment = await this.pluginRuntimeDeployment(workspaceId, pluginId);
      if (!deployment || !["deployed", "active", "disabled"].includes(deployment.runtimeStatus)) return undefined;
    }
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
      const permissions = await this.declaredPluginPermissions(pluginId);
      const ownerRoleId = `${workspaceId}:owner`;
      await this.db.prepare(`INSERT OR IGNORE INTO workspace_ui_activations
        (workspace_id, plugin_id, contribution_id, enabled, zone_override, order_index, configuration_json)
        SELECT ?, plugin_id, contribution_id, 1, zone_id, rowid, NULL
        FROM plugin_ui_contributions
        WHERE plugin_id = ? AND access_mode != 'public-candidate'`)
        .bind(workspaceId, pluginId)
        .run();
      if (permissions.length) {
        await this.db.batch(permissions.map((permission) => this.db.prepare("INSERT OR IGNORE INTO workspace_role_permissions (workspace_id, role_id, permission) VALUES (?, ?, ?)").bind(workspaceId, ownerRoleId, permission)));
      }
      await this.db.prepare("UPDATE workspace_ui_activations SET enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId).run();
      await this.db.prepare(`UPDATE plugin_runtime_deployments
        SET runtime_status = 'active', activated_at = CURRENT_TIMESTAMP, disabled_at = NULL, last_error = NULL
        WHERE workspace_id = ? AND plugin_id = ? AND runtime_status IN ('deployed', 'active', 'disabled')`)
        .bind(workspaceId, pluginId)
        .run();
    } else {
      await this.db.prepare("UPDATE workspace_ui_activations SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId).run();
      await this.db.prepare(`UPDATE plugin_runtime_deployments
        SET runtime_status = 'disabled', disabled_at = CURRENT_TIMESTAMP, last_error = NULL
        WHERE workspace_id = ? AND plugin_id = ?`)
        .bind(workspaceId, pluginId)
        .run();
    }
    await this.audit(workspaceId, active ? "plugin.activate" : "plugin.deactivate", { pluginId });
    return { workspaceId, pluginId, active, updatedAt: new Date().toISOString() };
  }

  async upsertPluginRuntimeDeployment(input: Omit<PluginRuntimeDeployment, "createdAt" | "activatedAt" | "disabledAt">) {
    await this.db.prepare(`INSERT INTO plugin_runtime_deployments
      (workspace_id, plugin_id, release_id, runtime_key, runtime_kind, runtime_status, deployed_version, deployment_id, activated_at, disabled_at, last_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END, CASE WHEN ? = 'disabled' THEN CURRENT_TIMESTAMP ELSE NULL END, ?)
      ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET
        release_id = excluded.release_id,
        runtime_key = excluded.runtime_key,
        runtime_kind = excluded.runtime_kind,
        runtime_status = excluded.runtime_status,
        deployed_version = excluded.deployed_version,
        deployment_id = excluded.deployment_id,
        activated_at = CASE WHEN excluded.runtime_status = 'active' THEN CURRENT_TIMESTAMP ELSE plugin_runtime_deployments.activated_at END,
        disabled_at = CASE WHEN excluded.runtime_status = 'disabled' THEN CURRENT_TIMESTAMP ELSE NULL END,
        last_error = excluded.last_error`)
      .bind(input.workspaceId, input.pluginId, input.releaseId, input.runtimeKey, input.runtimeKind, input.runtimeStatus, input.deployedVersion, input.deploymentId, input.runtimeStatus, input.runtimeStatus, input.lastError)
      .run();
  }

  async pluginRuntimeDeployment(workspaceId: string, pluginId: string): Promise<PluginRuntimeDeployment | undefined> {
    const row = await this.db.prepare(`SELECT workspace_id, plugin_id, release_id, runtime_key, runtime_kind, runtime_status, deployed_version, deployment_id, created_at, activated_at, disabled_at, last_error
      FROM plugin_runtime_deployments
      WHERE workspace_id = ? AND plugin_id = ?
      LIMIT 1`)
      .bind(workspaceId, pluginId)
      .first<{ workspace_id: string; plugin_id: string; release_id: string; runtime_key: string; runtime_kind: PluginRuntimeDeployment["runtimeKind"]; runtime_status: PluginRuntimeDeployment["runtimeStatus"]; deployed_version: string | null; deployment_id: string | null; created_at: string; activated_at: string | null; disabled_at: string | null; last_error: string | null }>();
    return row ? {
      workspaceId: row.workspace_id,
      pluginId: row.plugin_id,
      releaseId: row.release_id,
      runtimeKey: row.runtime_key,
      runtimeKind: row.runtime_kind,
      runtimeStatus: row.runtime_status,
      deployedVersion: row.deployed_version,
      deploymentId: row.deployment_id,
      createdAt: row.created_at,
      activatedAt: row.activated_at,
      disabledAt: row.disabled_at,
      lastError: row.last_error,
    } : undefined;
  }

  async activePluginRuntime(workspaceId: string, pluginId: string): Promise<PluginRuntimeDeployment | undefined> {
    const row = await this.db.prepare(`SELECT workspace_id, plugin_id, release_id, runtime_key, runtime_kind, runtime_status, deployed_version, deployment_id, created_at, activated_at, disabled_at, last_error
      FROM plugin_runtime_deployments
      WHERE workspace_id = ? AND plugin_id = ? AND runtime_status = 'active'
      LIMIT 1`)
      .bind(workspaceId, pluginId)
      .first<{ workspace_id: string; plugin_id: string; release_id: string; runtime_key: string; runtime_kind: PluginRuntimeDeployment["runtimeKind"]; runtime_status: PluginRuntimeDeployment["runtimeStatus"]; deployed_version: string | null; deployment_id: string | null; created_at: string; activated_at: string | null; disabled_at: string | null; last_error: string | null }>();
    return row ? {
      workspaceId: row.workspace_id,
      pluginId: row.plugin_id,
      releaseId: row.release_id,
      runtimeKey: row.runtime_key,
      runtimeKind: row.runtime_kind,
      runtimeStatus: row.runtime_status,
      deployedVersion: row.deployed_version,
      deploymentId: row.deployment_id,
      createdAt: row.created_at,
      activatedAt: row.activated_at,
      disabledAt: row.disabled_at,
      lastError: row.last_error,
    } : undefined;
  }

  activate(workspaceId: string, pluginId: string) { return this.setActive(workspaceId, pluginId, true); }
  deactivate(workspaceId: string, pluginId: string) { return this.setActive(workspaceId, pluginId, false); }

  async activePlugins(workspaceId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT plugin_id FROM workspace_plugins WHERE workspace_id = ? AND active = 1 AND plugin_id != 'platform'").bind(workspaceId).all<{ plugin_id: string }>();
    return rows.results.map((row) => row.plugin_id);
  }

  async workspacePlugins(workspaceId: string): Promise<PluginWorkspaceState[]> {
    const rows = await this.db.prepare("SELECT workspace_id, plugin_id, active, updated_at FROM workspace_plugins WHERE workspace_id = ? AND plugin_id != 'platform'").bind(workspaceId).all<{ workspace_id: string; plugin_id: string; active: number; updated_at: string }>();
    return rows.results.map((row) => ({ workspaceId: row.workspace_id, pluginId: row.plugin_id, active: row.active === 1, updatedAt: row.updated_at }));
  }

  async workspaceUiSurfaces(workspaceId: string): Promise<SurfaceContribution[]> {
    const rows = await this.db.prepare(`SELECT c.plugin_id, c.contribution_id, c.zone_id, c.template_id, c.schema_json, a.zone_override, a.order_index
      FROM workspace_ui_activations a
      INNER JOIN workspace_plugins wp ON wp.workspace_id = a.workspace_id AND wp.plugin_id = a.plugin_id AND wp.active = 1
      INNER JOIN plugin_ui_contributions c ON c.plugin_id = a.plugin_id AND c.contribution_id = a.contribution_id
      WHERE a.workspace_id = ? AND a.enabled = 1 AND c.contribution_type = 'surface' AND c.access_mode != 'public-candidate'
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
    const row = await this.db.prepare(`SELECT c.plugin_id, c.contribution_id, c.schema_json, c.required_permission
      FROM workspace_ui_activations a
      INNER JOIN workspace_plugins wp ON wp.workspace_id = a.workspace_id AND wp.plugin_id = a.plugin_id AND wp.active = 1
      INNER JOIN plugin_ui_contributions c ON c.plugin_id = a.plugin_id AND c.contribution_id = a.contribution_id
      WHERE a.workspace_id = ? AND a.contribution_id = ? AND a.enabled = 1 AND c.contribution_type IN ('page', 'settings-panel') AND c.access_mode != 'public-candidate'
      ORDER BY a.order_index
      LIMIT 1`)
      .bind(workspaceId, contributionId)
      .first<{ plugin_id: string; contribution_id: string; schema_json: string; required_permission: string | null }>();
    if (!row) return undefined;
    const raw = JSON.parse(row.schema_json) as unknown;
    const panel = settingsPanelContributionSchema.safeParse(raw);
    if (panel.success) {
      const settingsPage = declarativePageContributionSchema.parse({
        id: panel.data.schema.id,
        title: panel.data.schema.title,
        templateId: panel.data.templateId,
        access: panel.data.schema.access,
        dataSources: panel.data.sections.flatMap((section) => section.dataSourceId ? [{ id: section.dataSourceId, title: section.title, kind: "static", resource: section.dataSourceId, access: "private" as const }] : []),
        actions: panel.data.sections.flatMap((section) => section.actions),
        fields: [],
        columns: [],
        slots: panel.data.schema.slots,
        data: { ...panel.data.schema.data, settingsPanel: panel.data, settingsSections: panel.data.sections },
      });
      return { workspaceId, pluginId: row.plugin_id, contributionId: row.contribution_id, page: settingsPage, requiredPermission: row.required_permission };
    }
    return { workspaceId, pluginId: row.plugin_id, contributionId: row.contribution_id, page: declarativePageContributionSchema.parse(raw), requiredPermission: row.required_permission };
  }

  async settingsTabs(workspaceId: string): Promise<Array<SettingsTabResolution["tab"]>> {
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
      requiredPermission: null,
      policy: { id: row.policy_id, access: row.access, authenticationMode: row.authentication_mode, allowedOperations: JSON.parse(row.allowed_operations_json) as string[], enabled: row.policy_enabled === 1 },
    } : undefined;
  }

  async declaredCapabilities(pluginId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT capability_id FROM plugin_capabilities WHERE plugin_id = ?").bind(pluginId).all<{ capability_id: string }>();
    return rows.results.map((row) => row.capability_id);
  }

  async declaredPluginPermissions(pluginId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT permission FROM plugin_permissions WHERE plugin_id = ?").bind(pluginId).all<{ permission: string }>();
    return rows.results.map((row) => row.permission);
  }

  async assignRolePermissions(workspaceId: string, roleId: string, permissions: string[], actorId?: string) {
    await this.ensureWorkspaceRbac(workspaceId);
    const role = await this.db.prepare("SELECT id FROM workspace_roles WHERE workspace_id = ? AND id = ? LIMIT 1").bind(workspaceId, roleId).first<{ id: string }>();
    if (!role) return null;
    const platform = new Set(workspacePermissions);
    const pluginRows = await this.db.prepare(`SELECT DISTINCT permission
      FROM plugin_permissions permissions
      INNER JOIN workspace_plugins active ON active.plugin_id = permissions.plugin_id AND active.workspace_id = ? AND active.active = 1`)
      .bind(workspaceId)
      .all<{ permission: string }>();
    const allowed = new Set([...platform, ...pluginRows.results.map((row) => row.permission)]);
    if (!permissions.every((permission) => allowed.has(permission))) return null;
    await this.db.batch(permissions.map((permission) => this.db.prepare("INSERT OR IGNORE INTO workspace_role_permissions (workspace_id, role_id, permission) VALUES (?, ?, ?)").bind(workspaceId, roleId, permission)));
    await this.audit(workspaceId, "rbac.role.permissions.assign", { roleId, permissions }, actorId);
    return this.rolePermissionsFor(workspaceId, roleId);
  }

  async rolePermissionsFor(workspaceId: string, roleId: string): Promise<string[]> {
    const rows = await this.db.prepare("SELECT permission FROM workspace_role_permissions WHERE workspace_id = ? AND role_id = ? ORDER BY permission").bind(workspaceId, roleId).all<{ permission: string }>();
    return rows.results.map((row) => row.permission);
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
    const workspace = await this.db.prepare("SELECT name FROM workspaces WHERE id = ?").bind(workspaceId).first<{ name: string }>();
    const settings = await this.listSettings(workspaceId, "platform");
    return {
      workspaceName: settings.workspaceName ?? workspace?.name ?? "Default Workspace",
      language: settings.language ?? settings.communicationLanguage ?? "ro-RO",
      businessDisplayName: settings.businessDisplayName ?? "",
      locale: settings.locale ?? "ro-RO",
      timezone: settings.timezone ?? "Europe/Bucharest",
      currency: settings.currency ?? "RON",
      defaultCurrency: settings.defaultCurrency ?? settings.currency ?? "RON",
      brandingName: settings.brandingName ?? "",
      brandColor: settings.brandColor ?? "#1f2937",
      contactEmailPublic: settings.contactEmailPublic ?? "",
      contactPhonePublic: settings.contactPhonePublic ?? "",
      communicationLanguage: settings.communicationLanguage ?? settings.language ?? "ro-RO",
      emailDeliveryStatus: (await this.activeMailProvider(workspaceId)) ? "configured" : "unavailable",
      serviceHealth: { core: "ok", auth: "external", marketplace: "ok" },
    };
  }

  async saveGeneralSettings(workspaceId: string, input: Record<string, unknown>, actorId?: string) {
    const allowed = ["workspaceName", "language", "businessDisplayName", "locale", "timezone", "currency", "defaultCurrency", "brandingName", "brandColor", "contactEmailPublic", "contactPhonePublic", "communicationLanguage"];
    await this.ensureWorkspace(workspaceId);
    const statements = allowed.map((key) => this.db.prepare("INSERT INTO workspace_settings (workspace_id, scope, key, value_json, updated_at) VALUES (?, 'platform', ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, scope, key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP")
      .bind(workspaceId, key, JSON.stringify(input[key] ?? "")));
    if (typeof input.workspaceName === "string" && input.workspaceName.trim()) statements.push(this.db.prepare("UPDATE workspaces SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(input.workspaceName.trim(), workspaceId));
    if (typeof input.language === "string" && input.language.trim()) statements.push(this.db.prepare("INSERT INTO workspace_settings (workspace_id, scope, key, value_json, updated_at) VALUES (?, 'platform', 'communicationLanguage', ?, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, scope, key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP").bind(workspaceId, JSON.stringify(input.language.trim())));
    if (typeof input.defaultCurrency === "string" && input.defaultCurrency.trim()) statements.push(this.db.prepare("INSERT INTO workspace_settings (workspace_id, scope, key, value_json, updated_at) VALUES (?, 'platform', 'currency', ?, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, scope, key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP").bind(workspaceId, JSON.stringify(input.defaultCurrency.trim())));
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

  async activeDomains(workspaceId: string, kinds: WorkspaceDomain["kind"][]): Promise<WorkspaceDomain[]> {
    const placeholders = kinds.map(() => "?").join(", ");
    const rows = await this.db.prepare(`SELECT id, workspace_id, hostname, kind, status, verification_method, verification_instructions_json, publication_id, is_primary, created_at, verified_at, updated_at
      FROM workspace_domains WHERE workspace_id = ? AND status = 'active' AND kind IN (${placeholders}) ORDER BY is_primary DESC, updated_at DESC`)
      .bind(workspaceId, ...kinds)
      .all<{ id: string; workspace_id: string; hostname: string; kind: WorkspaceDomain["kind"]; status: WorkspaceDomain["status"]; verification_method: WorkspaceDomain["verificationMethod"]; verification_instructions_json: string | null; publication_id: string | null; is_primary: number; created_at: string; verified_at: string | null; updated_at: string }>();
    return rows.results.map((row) => this.domainRow(row));
  }

  async domain(workspaceId: string, domainId: string): Promise<WorkspaceDomain | null> {
    const row = await this.db.prepare(`SELECT id, workspace_id, hostname, kind, status, verification_method, verification_instructions_json, publication_id, is_primary, created_at, verified_at, updated_at
      FROM workspace_domains WHERE workspace_id = ? AND id = ? LIMIT 1`)
      .bind(workspaceId, domainId)
      .first<{ id: string; workspace_id: string; hostname: string; kind: WorkspaceDomain["kind"]; status: WorkspaceDomain["status"]; verification_method: WorkspaceDomain["verificationMethod"]; verification_instructions_json: string | null; publication_id: string | null; is_primary: number; created_at: string; verified_at: string | null; updated_at: string }>();
    return row ? this.domainRow(row) : null;
  }

  async createDomain(workspaceId: string, input: { hostname: string; kind: WorkspaceDomain["kind"]; verificationMethod?: WorkspaceDomain["verificationMethod"]; isPrimary?: boolean }, actorId?: string) {
    await this.ensureWorkspace(workspaceId);
    const hostname = input.hostname.trim().toLowerCase();
    const token = crypto.randomUUID();
    const method = input.verificationMethod ?? "manual";
    const instructions = method === "dns-cname"
      ? { method, cnameRecord: `_v2-verify.${hostname}`, target: `${token}.verify.v2.local` }
      : { method, txtRecord: `_v2-verify.${hostname}`, token };
    await this.db.prepare(`INSERT INTO workspace_domains
      (id, workspace_id, hostname, kind, status, verification_method, verification_token_hash, verification_instructions_json, is_primary, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(crypto.randomUUID(), workspaceId, hostname, input.kind, method, await this.sha256(token), JSON.stringify(instructions), input.isPrimary ? 1 : 0)
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

  async deleteDomain(workspaceId: string, domainId: string, actorId?: string) {
    await this.db.prepare("DELETE FROM workspace_domains WHERE workspace_id = ? AND id = ?").bind(workspaceId, domainId).run();
    await this.audit(workspaceId, "domain.delete", { domainId }, actorId);
    return this.listDomains(workspaceId);
  }

  private async sha256(value: string) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  private mailProviderRow(row: MailProviderRow): MailProviderPublicSummary {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      kind: row.kind,
      label: row.label,
      status: row.status,
      enabled: row.enabled === 1,
      fromName: row.from_name,
      fromEmail: row.from_email,
      replyToEmail: row.reply_to_email,
      safeConfig: JSON.parse(row.safe_config_json || "{}") as MailProviderPublicSummary["safeConfig"],
      isDefaultTransactional: row.is_default_transactional === 1,
      lastTestedAt: row.last_tested_at,
      lastTestStatus: row.last_test_status,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mailProviderInternal(row: MailProviderRow): MailProviderPublicSummary & { configurationRef: string | null } {
    return { ...this.mailProviderRow(row), configurationRef: row.configuration_ref };
  }

  private defaultMailTemplates(workspaceId: string): MailTemplate[] {
    const specs = [
      ["owner_setup", "Set up your workspace owner account", "Use this one-time setup link: {{setupUrl}}"],
      ["workspace_invite", "Workspace invitation", "You were invited to {{workspaceName}}. Accept here: {{inviteUrl}}"],
      ["verify_email", "Verify your email", "Verify your email address: {{verificationUrl}}"],
      ["reset_password", "Reset your password", "Reset your password: {{resetUrl}}"],
      ["notification_generic", "{{subject}}", "{{body}}"],
    ] as const;
    return specs.map(([templateKey, subjectTemplate, bodyTextTemplate]) => ({ id: `${workspaceId}:${templateKey}:ro-RO`, workspaceId, templateKey, subjectTemplate, bodyTextTemplate, bodyHtmlTemplate: null, status: "active", locale: "ro-RO" }));
  }

  async ensureMailTemplates(workspaceId: string) {
    await this.ensureWorkspace(workspaceId);
    await this.db.batch(this.defaultMailTemplates(workspaceId).map((template) => this.db.prepare(`INSERT OR IGNORE INTO workspace_mail_templates
      (id, workspace_id, template_key, subject_template, body_text_template, body_html_template, status, locale)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(template.id, workspaceId, template.templateKey, template.subjectTemplate, template.bodyTextTemplate, template.bodyHtmlTemplate, template.status, template.locale)));
  }

  async mailSummary(workspaceId: string) {
    await this.ensureMailTemplates(workspaceId);
    const providers = await this.listMailProviders(workspaceId);
    const templates = await this.listMailTemplates(workspaceId);
    const events = await this.db.prepare(`SELECT id, provider_id, template_key, status, purpose, error_safe, created_at, completed_at
      FROM mail_delivery_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 20`).bind(workspaceId)
      .all<{ id: string; provider_id: string | null; template_key: string | null; status: string; purpose: string; error_safe: string | null; created_at: string; completed_at: string | null }>();
    return { providers, templates, events: events.results, activeProvider: providers.find((provider) => provider.isDefaultTransactional && provider.enabled && provider.status === "active") ?? null };
  }

  async listMailProviders(workspaceId: string): Promise<MailProviderPublicSummary[]> {
    const rows = await this.db.prepare(`SELECT id, workspace_id, kind, label, status, enabled, from_name, from_email, reply_to_email, configuration_ref, safe_config_json, is_default_transactional, last_tested_at, last_test_status, last_error, created_at, updated_at
      FROM workspace_mail_providers WHERE workspace_id = ? ORDER BY is_default_transactional DESC, label`).bind(workspaceId).all<MailProviderRow>();
    return rows.results.map((row) => this.mailProviderRow(row));
  }

  private async activeMailProviderRow(workspaceId: string): Promise<MailProviderRow | null> {
    return await this.db.prepare(`SELECT id, workspace_id, kind, label, status, enabled, from_name, from_email, reply_to_email, configuration_ref, safe_config_json, is_default_transactional, last_tested_at, last_test_status, last_error, created_at, updated_at
      FROM workspace_mail_providers WHERE workspace_id = ? AND enabled = 1 AND status = 'active' AND is_default_transactional = 1 LIMIT 1`).bind(workspaceId).first<MailProviderRow>();
  }

  async activeMailProvider(workspaceId: string): Promise<MailProviderPublicSummary | null> {
    const row = await this.activeMailProviderRow(workspaceId);
    return row ? this.mailProviderRow(row) : null;
  }

  async configureMailProvider(workspaceId: string, input: MailProviderConfigure, actorId?: string) {
    await this.ensureWorkspace(workspaceId);
    const providerId = `${workspaceId}:mail:${crypto.randomUUID()}`;
    const status = input.kind === "mock-development-only" ? "configured" : input.configurationRef ? "configured" : "draft";
    await this.db.prepare(`INSERT INTO workspace_mail_providers
      (id, workspace_id, kind, label, status, enabled, from_name, from_email, reply_to_email, configuration_ref, safe_config_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(providerId, workspaceId, input.kind, input.label, status, input.enabled ? 1 : 0, input.fromName, input.fromEmail, input.replyToEmail ?? null, input.configurationRef ?? null, JSON.stringify(input.safeConfig ?? {}))
      .run();
    await this.audit(workspaceId, "mail.provider.configure", { providerId, kind: input.kind, secretStoredAsRef: Boolean(input.configurationRef) }, actorId);
    return this.mailSummary(workspaceId);
  }

  async saveMailProvider(workspaceId: string, input: MailProviderConfigure, actorId?: string) {
    await this.ensureWorkspace(workspaceId);
    const activeProvider = await this.activeMailProviderRow(workspaceId);
    if (!activeProvider) return this.configureMailProvider(workspaceId, input, actorId);
    const status = input.kind === "mock-development-only" ? "configured" : input.configurationRef ? "configured" : "draft";
    await this.db.prepare(`UPDATE workspace_mail_providers
      SET kind = ?, label = ?, status = ?, enabled = ?, from_name = ?, from_email = ?, reply_to_email = ?, configuration_ref = ?, safe_config_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND id = ?`)
      .bind(input.kind, input.label, status, input.enabled ? 1 : 0, input.fromName, input.fromEmail, input.replyToEmail ?? null, input.configurationRef ?? null, JSON.stringify(input.safeConfig ?? {}), workspaceId, activeProvider.id)
      .run();
    await this.audit(workspaceId, "mail.provider.save", { providerId: activeProvider.id, kind: input.kind, secretStoredAsRef: Boolean(input.configurationRef) }, actorId);
    return this.mailSummary(workspaceId);
  }

  async activateMailProvider(workspaceId: string, providerId: string, actorId?: string) {
    await this.db.batch([
      this.db.prepare("UPDATE workspace_mail_providers SET is_default_transactional = 0, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?").bind(workspaceId),
      this.db.prepare("UPDATE workspace_mail_providers SET status = 'active', enabled = 1, is_default_transactional = 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?").bind(workspaceId, providerId),
    ]);
    await this.audit(workspaceId, "mail.provider.activate", { providerId }, actorId);
    return this.mailSummary(workspaceId);
  }

  async disableMailProvider(workspaceId: string, providerId: string, actorId?: string) {
    await this.db.prepare("UPDATE workspace_mail_providers SET status = 'disabled', enabled = 0, is_default_transactional = 0, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?").bind(workspaceId, providerId).run();
    await this.audit(workspaceId, "mail.provider.disable", { providerId }, actorId);
    return this.mailSummary(workspaceId);
  }

  async listMailTemplates(workspaceId: string): Promise<MailTemplate[]> {
    await this.ensureMailTemplates(workspaceId);
    const rows = await this.db.prepare(`SELECT id, workspace_id, template_key, subject_template, body_text_template, body_html_template, status, locale, created_at, updated_at
      FROM workspace_mail_templates WHERE workspace_id = ? ORDER BY template_key, locale`).bind(workspaceId)
      .all<{ id: string; workspace_id: string; template_key: MailTemplate["templateKey"]; subject_template: string; body_text_template: string; body_html_template: string | null; status: MailTemplate["status"]; locale: string; created_at: string; updated_at: string }>();
    return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, templateKey: row.template_key, subjectTemplate: row.subject_template, bodyTextTemplate: row.body_text_template, bodyHtmlTemplate: row.body_html_template, status: row.status, locale: row.locale, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async sendMail(request: MailMessageRequest): Promise<MailDeliveryResult> {
    const providerRow = await this.activeMailProviderRow(request.workspaceId);
    const provider = providerRow ? this.mailProviderInternal(providerRow) : null;
    const recipientHash = await this.sha256(request.to.toLowerCase());
    const eventId = crypto.randomUUID();
    if (!provider) {
      await this.db.prepare(`INSERT INTO mail_delivery_events (id, workspace_id, provider_id, template_key, recipient_hash_or_safe_reference, status, purpose, error_safe, completed_at)
        VALUES (?, ?, NULL, ?, ?, 'failed', ?, 'No active Core transactional mail provider is configured.', CURRENT_TIMESTAMP)`)
        .bind(eventId, request.workspaceId, request.templateKey ?? null, recipientHash, request.purpose).run();
      return { ok: false, status: "failed", providerId: null, eventId, errorSafe: "No active Core transactional mail provider is configured." };
    }
    await this.db.prepare(`INSERT INTO mail_delivery_events (id, workspace_id, provider_id, template_key, recipient_hash_or_safe_reference, status, purpose)
      VALUES (?, ?, ?, ?, ?, 'queued', ?)`)
      .bind(eventId, request.workspaceId, provider.id, request.templateKey ?? null, recipientHash, request.purpose).run();
    const templates = await this.listMailTemplates(request.workspaceId);
    const template = request.templateKey ? templates.find((item) => item.templateKey === request.templateKey && item.status === "active") : undefined;
    const html = request.html ?? (template?.bodyHtmlTemplate ? interpolate(template.bodyHtmlTemplate, request.variables) : undefined);
    const message = {
      workspaceId: request.workspaceId,
      purpose: request.purpose,
      to: request.to,
      variables: request.variables,
      ...(request.templateKey ? { templateKey: request.templateKey } : {}),
      subject: request.subject ?? (template ? interpolate(template.subjectTemplate, request.variables) : ""),
      text: request.text ?? (template ? interpolate(template.bodyTextTemplate, request.variables) : ""),
      ...(html ? { html } : {}),
    };
    if (!message.subject || !message.text) {
      const errorSafe = "Mail request is missing subject/text and no active template could render it.";
      await this.db.prepare("UPDATE mail_delivery_events SET status = 'failed', error_safe = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(errorSafe, eventId).run();
      await this.audit(request.workspaceId, "mail.delivery.failed", { eventId, providerId: provider.id, purpose: request.purpose, errorSafe });
      return { ok: false, status: "failed", providerId: provider.id, eventId, errorSafe };
    }
    const delivered = await new CoreMailDeliveryAdapter(this.env).deliver(provider, message);
    await this.db.prepare("UPDATE mail_delivery_events SET status = ?, error_safe = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(delivered.ok ? "sent" : "failed", delivered.errorSafe ?? null, eventId).run();
    await this.audit(request.workspaceId, delivered.ok ? "mail.delivery.sent" : "mail.delivery.failed", { eventId, providerId: provider.id, purpose: request.purpose, providerMessageId: delivered.providerMessageId ?? null, errorSafe: delivered.errorSafe ?? null });
    return { ok: delivered.ok, status: delivered.ok ? "sent" : "failed", providerId: provider.id, eventId, errorSafe: delivered.errorSafe ?? null };
  }

  async testMailProvider(workspaceId: string, providerId: string, to: string, actorId?: string) {
    await this.activateMailProvider(workspaceId, providerId, actorId);
    const result = await this.sendMail({ workspaceId, purpose: "test", to, subject: "Core mail provider test", text: "This is a Core Mail Runtime test.", variables: {} });
    await this.db.prepare("UPDATE workspace_mail_providers SET last_tested_at = CURRENT_TIMESTAMP, last_test_status = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?")
      .bind(result.ok ? "sent" : "failed", result.errorSafe, workspaceId, providerId).run();
    await this.audit(workspaceId, "mail.provider.test", { providerId, ok: result.ok, eventId: result.eventId }, actorId);
    return { ok: result.ok, status: result.ok ? "sent" as const : "failed" as const, providerId, message: result.errorSafe ?? "Mail provider test accepted by Core Mail Runtime.", eventId: result.eventId };
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
