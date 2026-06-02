import { declarativeUiSchema, pluginManifestSchema, type PluginBundle, type PluginManifest, type PublicContributionAccess, type PublicRouteContribution, type PublicSurfaceContribution, type PublicToolContribution, type SurfaceContribution } from "@v2/plugin-contracts";
import type { MailDeliveryResult, MailMessageRequest, MailProviderConfigure, MailProviderPublicSummary, MailTemplate } from "@v2/mail-contracts";
import type { SettingScope, WorkspaceLayout } from "@v2/rpc-contracts";
import { declarativePageContributionSchema, publicRoutePatternSchema, settingsPanelContributionSchema, settingsTabContributionSchema, type AccessMode, type DeclarativePageContribution, type SettingsPanelContribution, type SettingsTabContribution } from "@v2/ui-schema";
import { platformSettingsTabs } from "./platform-settings";
import { isPlatformAdmin } from "./access";
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
export type CatalogReleaseOption = {
  id: string;
  releaseId: string;
  version: string;
  label: string;
  status: CatalogRelease["status"];
  source: string;
  sha256: string;
  workerIsolation: PluginBundle["worker"]["isolation"];
  uiMode: PluginBundle["ui"]["mode"];
  sizeBytes: number;
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
function allPublicContributions(manifest: PluginManifest): Array<PublicRouteContribution | PublicSurfaceContribution | PublicToolContribution> {
  return [...manifest.contributes.publicRoutes, ...manifest.contributes.publicSurfaces, ...manifest.contributes.publicTools];
}
export type PluginUiContribution = {
  pluginId: string;
  contributionId: string;
  contributionType: "surface" | "page" | "route" | "slot" | "menu";
  source: UiSource;
  accessMode: AccessMode;
  zoneId: string | null;
  defaultPath: string | null;
  visibleInNavigation?: boolean;
  label: string | null;
  icon: string | null;
  navigationSection: NavigationSection | null;
  displayOrder: number;
  rendererMode: UiRendererMode;
  componentId: string | null;
  configurable: UiConfigurable;
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
export type WorkspaceRecord = {
  id: string;
  name: string;
  status: "unprovisioned" | "provisioning" | "active" | "suspended";
  createdAt: string;
  updatedAt: string;
};
export type WorkspaceInvitationRecord = {
  id: string;
  workspaceId: string;
  email: string;
  roleId: string | null;
  roleName: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type WorkspacePermissionRecord = {
  id: WorkspacePermission;
  name: WorkspacePermission;
  category: string;
  roleCount: number;
  memberOverrideCount: number;
};
export type WorkspaceAuditPolicyRecord = {
  auth: boolean;
  core: boolean;
  plugin: boolean;
  shell: boolean;
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
export type PrivateRuntimeContributionResolution = RuntimeContributionResolution & {
  panel: SettingsPanelContribution;
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
  "workspaces.read",
  "auth.read", "auth.admin", "auth.method.publish", "auth.policy.write", "auth.ui.publish", "auth.session.read",
  "domains.read", "domains.write", "domains.verify",
  "mail.read", "mail.configure", "mail.test", "mail.template.write",
  "marketplace.read", "marketplace.publish", "plugin.install", "plugin.activate", "plugin.update", "plugin.uninstall", "plugin.grantCapability",
  "approval.read", "tool.approve", "audit.read", "layout.read", "layout.write", "interface.read", "interface.write", "publication.read", "publication.publish",
  "plan.read", "plan.write",
  "agent.read", "agent.use", "provider.read", "provider.configure",
  "localnode.read", "localnode.configure", "localnode.execute", "production.read", "production.execute", "production.approve",
] as const;
export type WorkspacePermission = string;
type MailSecretConfig = { endpoint?: string; token?: string; headers?: Record<string, string> };
type MailDeliveryAdapterResult = { ok: boolean; providerMessageId?: string; errorSafe?: string };
type AuthUserLookupRecord = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  language: string | null;
  location: string | null;
  timezone: string | null;
  passkeys: number;
  sessions: number;
  createdAt: number | string;
  updatedAt: number | string;
  isPlatformAdmin: boolean;
  disabledAt?: string | null;
};
type ActiveUserPlanRecord = PlanRecord & { assignmentId: string; startsAt: string | null; endsAt: string | null };

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

const WORKSPACE_RBAC_SEED_VERSION = "workspace-rbac:v2";
const PLATFORM_SETTINGS_SEED_VERSION = "platform-settings:v6";
const PLATFORM_SHELL_SEED_VERSION = "platform-shell:v1";
const protectedPlatformPages = new Set(["platform.home", "platform.account", "platform.settings"]);
const reservedShellPaths = new Set(["/login", "/setup/owner", "/bootstrap"]);

type NavigationSection = "user" | "administration";
type UiSource = "platform" | "plugin" | "manual";
type UiRendererMode = "native" | "declarative" | "sandbox-frame";
type UiConfigurable = {
  canHide: boolean;
  canRename: boolean;
  canReorder: boolean;
  canChangeIcon: boolean;
  canMoveSection: boolean;
  canDelete: boolean;
};
export type RuntimeNavigationItem = {
  id: string;
  pluginId: string;
  path: string;
  label: string;
  icon?: string;
  section: NavigationSection;
  displayOrder: number;
  rendererMode: UiRendererMode;
  componentId?: string;
  source: UiSource;
  requiredPermission?: string;
};
export type InterfaceContributionRow = RuntimeNavigationItem & {
  kind: string;
  active: boolean;
  visibleInNavigation: boolean;
  status: string;
  configurable: UiConfigurable;
};
export type ManualPageInput = {
  title: string;
  slug: string;
  label?: string;
  icon?: string;
  navigationSection?: NavigationSection;
  enabled?: boolean;
  visibleInNavigation?: boolean;
  displayOrder?: number;
  blocks?: Array<{ type: "heading" | "text"; text: string }>;
};

const defaultConfigurable: UiConfigurable = {
  canHide: true,
  canRename: true,
  canReorder: true,
  canChangeIcon: true,
  canMoveSection: true,
  canDelete: false,
};

function config(canDelete = false, overrides: Partial<UiConfigurable> = {}): UiConfigurable {
  return { ...defaultConfigurable, canDelete, ...overrides };
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function normalizeShellPath(path: string) {
  const trimmed = path.trim();
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replaceAll(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function manualContributionId(workspaceId: string, slug: string) {
  return `manual.${workspaceId}.${slug.replaceAll(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`;
}

export class CoreRepository {
  constructor(private readonly db: D1Database, private readonly env?: Pick<CoreEnv, "AUTH" | "ENVIRONMENT" | "MAIL_PROVIDER_CONFIGS_JSON" | "PLATFORM_ADMIN_EMAILS" | "RECOVERY_ADMIN_EMAILS" | "RECOVERY_ADMIN_ENABLED">) {}

  private async authInternalResponse(path: string, init?: { method?: string; body?: unknown }) {
    if (!this.env?.AUTH) throw new Error("Auth service binding is required.");
    const headers = new Headers();
    if (init?.body !== undefined) headers.set("content-type", "application/json");
    const response = await this.env.AUTH.fetch(`https://auth.internal${path}`, {
      method: init?.method ?? "GET",
      headers,
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    return response;
  }

  private async authInternalJson<T>(path: string, init?: { method?: string; body?: unknown }) {
    const response = await this.authInternalResponse(path, init);
    if (!response.ok) throw new Error(`Auth internal request failed: ${response.status}`);
    return response.json() as Promise<T>;
  }

  private async internalSeedCurrent(workspaceId: string, key: string, version: string) {
    const row = await this.db.prepare("SELECT value_json FROM workspace_settings WHERE workspace_id = ? AND scope = '__internal' AND key = ? LIMIT 1")
      .bind(workspaceId, key)
      .first<{ value_json: string }>();
    return row?.value_json === JSON.stringify(version);
  }

  private internalSeedStatement(workspaceId: string, key: string, version: string) {
    return this.db.prepare(`INSERT INTO workspace_settings (workspace_id, scope, key, value_json, updated_at)
      VALUES (?, '__internal', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, scope, key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`)
      .bind(workspaceId, key, JSON.stringify(version));
  }

  async ensureWorkspace(workspaceId: string, name = "Default Workspace", status: "unprovisioned" | "provisioning" | "active" | "suspended" = "unprovisioned") {
    await this.db.prepare("INSERT OR IGNORE INTO workspaces (id, name, status) VALUES (?, ?, ?)").bind(workspaceId, name, status).run();
  }

  async authUsers() {
    const response = await this.authInternalResponse("/internal/auth/users");
    if (!response.ok) throw new Error(`Auth internal user lookup failed: ${response.status}`);
    return response.json() as Promise<AuthUserLookupRecord[] | { users?: AuthUserLookupRecord[] }>;
  }

  async authUserById(userId: string) {
    const result = await this.authUsers();
    const users = Array.isArray(result) ? result : result.users ?? [];
    return users.find((user) => user.id === userId) ?? null;
  }

  async authUserByEmail(email: string) {
    const target = email.trim().toLowerCase();
    const result = await this.authUsers();
    const users = Array.isArray(result) ? result : result.users ?? [];
    return users.find((user) => user.email.toLowerCase() === target) ?? null;
  }

  async disableAuthUser(userId: string) {
    return this.authInternalResponse(`/internal/auth/users/${encodeURIComponent(userId)}/disable`, { method: "POST" });
  }

  async deleteAuthUser(userId: string) {
    return this.authInternalResponse(`/internal/auth/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  }

  async workspaceOwnerCount(workspaceId: string) {
    const row = await this.db.prepare(`SELECT COUNT(DISTINCT member_roles.user_id) AS count
      FROM workspace_member_roles member_roles
      INNER JOIN workspace_roles roles ON roles.workspace_id = member_roles.workspace_id AND roles.id = member_roles.role_id AND roles.system_key = 'owner'
      INNER JOIN workspace_members members ON members.workspace_id = member_roles.workspace_id AND members.user_id = member_roles.user_id AND members.status = 'active'
      WHERE member_roles.workspace_id = ?`)
      .bind(workspaceId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async countOwnedWorkspaces(userId: string) {
    const row = await this.db.prepare(`SELECT COUNT(DISTINCT member_roles.workspace_id) AS count
      FROM workspace_member_roles member_roles
      INNER JOIN workspace_roles roles ON roles.workspace_id = member_roles.workspace_id AND roles.id = member_roles.role_id AND roles.system_key = 'owner'
      INNER JOIN workspace_members members ON members.workspace_id = member_roles.workspace_id AND members.user_id = member_roles.user_id AND members.status = 'active'
      INNER JOIN workspaces ON workspaces.id = member_roles.workspace_id
      WHERE member_roles.user_id = ? AND workspaces.status != 'suspended'`)
      .bind(userId)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  async activeUserPlan(userId: string): Promise<ActiveUserPlanRecord | null> {
    const row = await this.db.prepare(`SELECT assignments.id AS assignment_id, assignments.plan_id, assignments.starts_at, assignments.ends_at, plans.name, plans.status, plans.limits_json, plans.created_at, plans.updated_at
      FROM user_plan_assignments assignments
      INNER JOIN plans ON plans.id = assignments.plan_id
      WHERE assignments.user_id = ? AND assignments.status = 'active' AND (assignments.starts_at IS NULL OR assignments.starts_at <= CURRENT_TIMESTAMP) AND (assignments.ends_at IS NULL OR assignments.ends_at > CURRENT_TIMESTAMP) AND plans.status = 'active'
      ORDER BY assignments.created_at DESC, assignments.updated_at DESC
      LIMIT 1`)
      .bind(userId)
      .first<{ assignment_id: string; plan_id: string; starts_at: string | null; ends_at: string | null; name: string; status: PlanRecord["status"]; limits_json: string; created_at: string; updated_at: string }>();
    if (!row) return null;
    return {
      id: row.plan_id,
      name: row.name,
      status: row.status,
      limits: JSON.parse(row.limits_json || "{}") as Record<string, unknown>,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assignmentId: row.assignment_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    };
  }

  async workspaces(): Promise<WorkspaceRecord[]> {
    const rows = await this.db.prepare("SELECT id, name, status, created_at, updated_at FROM workspaces ORDER BY name").all<{ id: string; name: string; status: WorkspaceRecord["status"]; created_at: string; updated_at: string }>();
    return rows.results.map((row) => ({ id: row.id, name: row.name, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async workspace(workspaceId: string): Promise<WorkspaceRecord | null> {
    const row = await this.db.prepare("SELECT id, name, status, created_at, updated_at FROM workspaces WHERE id = ? LIMIT 1").bind(workspaceId).first<{ id: string; name: string; status: WorkspaceRecord["status"]; created_at: string; updated_at: string }>();
    return row ? { id: row.id, name: row.name, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }

  async upsertWorkspace(input: { id?: string; name: string; status: WorkspaceRecord["status"] }, actorId?: string) {
    const id = input.id?.trim() || crypto.randomUUID();
    const name = input.name.trim();
    const actor = actorId ? await this.authUserById(actorId) : null;
    const isAdmin = actor ? (this.env ? isPlatformAdmin(this.env, { id: actor.id, email: actor.email }) : false) : false;
    const existing = input.id ? await this.workspace(input.id) : null;
    const creating = !existing;
    if (creating && !isAdmin && actorId) {
      const plan = await this.activeUserPlan(actorId);
      if (!plan) throw new Error("An active plan is required to create a workspace.");
      const maxWorkspaces = typeof plan.limits.maxWorkspaces === "number" ? plan.limits.maxWorkspaces : null;
      if (maxWorkspaces !== null && (await this.countOwnedWorkspaces(actorId)) >= maxWorkspaces) {
        throw new Error("Workspace limit for the active plan has been reached.");
      }
    }
    if (existing && !isAdmin) {
      const actorMember = actorId ? (await this.workspaceMemberRecords(id)).find((member) => member.user.id === actorId) : null;
      if (!actorMember?.roles.some((role) => role.systemKey === "owner")) throw new Error("Only a workspace Owner or platform Superadmin may update a workspace.");
    }
    await this.db.prepare(`INSERT INTO workspaces (id, name, status, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, updated_at = CURRENT_TIMESTAMP`)
      .bind(id, name, input.status)
      .run();
    if (creating && actorId && !isAdmin) {
      await this.ensureWorkspaceRbac(id);
      await this.db.batch([
        this.db.prepare(`INSERT INTO workspace_members (workspace_id, user_id, email, status, updated_at)
          VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
          ON CONFLICT(workspace_id, user_id) DO UPDATE SET email = excluded.email, status = 'active', updated_at = CURRENT_TIMESTAMP`)
          .bind(id, actorId, actor?.email ?? null),
        this.db.prepare("INSERT OR IGNORE INTO workspace_member_roles (workspace_id, user_id, role_id) VALUES (?, ?, ?)").bind(id, actorId, `${id}:owner`),
      ]);
    } else {
      await this.ensureWorkspaceRbac(id);
    }
    await this.audit(id, "workspace.upsert", { workspaceId: id, name, status: input.status, created: creating, actorIsPlatformAdmin: isAdmin }, actorId);
    return (await this.workspaces()).find((workspace) => workspace.id === id) ?? null;
  }

  async deleteWorkspace(workspaceId: string, actorId?: string) {
    const actor = actorId ? await this.authUserById(actorId) : null;
    const isAdmin = actor ? (this.env ? isPlatformAdmin(this.env, { id: actor.id, email: actor.email }) : false) : false;
    if (!isAdmin && actorId) {
      const actorMember = (await this.workspaceMemberRecords(workspaceId)).find((member) => member.user.id === actorId);
      if (!actorMember?.roles.some((role) => role.systemKey === "owner")) return false;
    }
    await this.db.prepare("DELETE FROM workspaces WHERE id = ?").bind(workspaceId).run();
    await this.audit(null, "workspace.delete", { workspaceId }, actorId);
    return true;
  }

  private rolePermissions(systemKey: "owner" | "admin" | "editor" | "viewer"): WorkspacePermission[] {
    if (systemKey === "owner") return [...workspacePermissions];
    if (systemKey === "admin") return [
      "workspace.read", "workspace.settings.read", "workspace.settings.write",
      "domains.read", "domains.write", "domains.verify",
      "mail.read", "mail.configure", "mail.test", "mail.template.write",
      "marketplace.read", "plugin.install", "plugin.activate", "plugin.update", "plugin.uninstall",
      "approval.read", "tool.approve", "audit.read", "layout.read", "layout.write", "interface.read", "interface.write", "publication.read", "publication.publish", "plan.read",
    ];
    if (systemKey === "editor") return [
      "workspace.read", "workspace.settings.read",
      "layout.read", "layout.write",
      "interface.read", "interface.write",
      "publication.read", "publication.publish",
    ];
    return ["workspace.read", "workspace.settings.read", "layout.read", "interface.read", "publication.read"];
  }

  private async migrateLegacyWorkspaceRoles(workspaceId: string) {
    const operator = await this.db.prepare("SELECT id FROM workspace_roles WHERE workspace_id = ? AND system_key = 'operator' LIMIT 1").bind(workspaceId).first<{ id: string }>();
    if (!operator) return;
    const editorRoleId = `${workspaceId}:editor`;
    const statements = [] as ReturnType<D1Database["prepare"]>[];
    statements.push(
      this.db.prepare(`INSERT INTO workspace_roles (id, workspace_id, name, system_key, description, updated_at)
        VALUES (?, ?, 'Editor', 'editor', 'Workspace content editing access', CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, system_key = excluded.system_key, description = excluded.description, updated_at = CURRENT_TIMESTAMP`)
        .bind(editorRoleId, workspaceId),
    );
    for (const permission of this.rolePermissions("editor")) {
      statements.push(this.db.prepare("INSERT OR IGNORE INTO workspace_role_permissions (workspace_id, role_id, permission) VALUES (?, ?, ?)").bind(workspaceId, editorRoleId, permission));
    }
    statements.push(
      this.db.prepare("UPDATE workspace_member_roles SET role_id = ? WHERE workspace_id = ? AND role_id = ?").bind(editorRoleId, workspaceId, operator.id),
      this.db.prepare("UPDATE workspace_invitations SET role_id = ? WHERE workspace_id = ? AND role_id = ?").bind(editorRoleId, workspaceId, operator.id),
      this.db.prepare("DELETE FROM workspace_role_permissions WHERE workspace_id = ? AND role_id = ?").bind(workspaceId, operator.id),
      this.db.prepare("DELETE FROM workspace_roles WHERE workspace_id = ? AND id = ?").bind(workspaceId, operator.id),
    );
    await this.db.batch(statements);
  }

  async ensureWorkspaceRbac(workspaceId: string) {
    await this.migrateLegacyWorkspaceRoles(workspaceId);
    if (await this.internalSeedCurrent(workspaceId, "rbac.seed", WORKSPACE_RBAC_SEED_VERSION)) return;
    await this.ensureWorkspace(workspaceId);
    const roles = [
      ["owner", "Owner", "Full workspace owner permissions"],
      ["admin", "Admin", "Workspace administration without owner recovery permissions"],
      ["editor", "Editor", "Workspace content editing access"],
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
    statements.push(this.internalSeedStatement(workspaceId, "rbac.seed", WORKSPACE_RBAC_SEED_VERSION));
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

  private async permissionEvaluationForUser(workspaceId: string, userId: string) {
    const email = await this.userEmail(userId);
    if (this.env && email && isPlatformAdmin(this.env, { id: userId, email })) return { permissions: [...workspacePermissions], denied: new Set<WorkspacePermission>() };
    const [basePermissions, overrides] = await Promise.all([
      this.permissionsForUser(workspaceId, userId),
      this.db.prepare(`SELECT overrides.permission, overrides.effect
        FROM workspace_member_permission_overrides overrides
        INNER JOIN workspace_members members
          ON members.workspace_id = overrides.workspace_id
          AND members.user_id = overrides.user_id
          AND members.status = 'active'
        WHERE overrides.workspace_id = ? AND overrides.user_id = ?
        ORDER BY overrides.permission`)
        .bind(workspaceId, userId)
        .all<{ permission: WorkspacePermission; effect: "allow" | "deny" }>(),
    ]);
    const permissions = new Set(basePermissions);
    const denied = new Set<WorkspacePermission>();
    for (const override of overrides.results) {
      if (override.effect === "deny") {
        permissions.delete(override.permission);
        denied.add(override.permission);
      } else {
        permissions.add(override.permission);
      }
    }
    return { permissions: [...permissions].sort(), denied };
  }

  private async userEmail(userId: string) {
    const row = await this.db.prepare("SELECT email FROM workspace_members WHERE user_id = ? LIMIT 1").bind(userId).first<{ email: string | null }>();
    if (row?.email) return row.email;
    const user = await this.db.prepare("SELECT email FROM user WHERE id = ? LIMIT 1").bind(userId).first<{ email: string | null }>().catch(() => null);
    return user?.email ?? null;
  }

  async effectivePermissionsForUser(workspaceId: string, userId: string): Promise<WorkspacePermission[]> {
    return (await this.permissionEvaluationForUser(workspaceId, userId)).permissions;
  }

  async hasPermission(workspaceId: string, user: { id: string; email: string } | null, permission: WorkspacePermission): Promise<boolean> {
    if (!user) return false;
    if (this.env && isPlatformAdmin(this.env, user)) return true;
    const evaluation = await this.permissionEvaluationForUser(workspaceId, user.id);
    if (evaluation.denied.has(permission)) return false;
    return evaluation.permissions.includes(permission) || evaluation.permissions.includes("workspace.admin");
  }

  async hasAllPermissions(workspaceId: string, user: { id: string; email: string } | null, permissions: WorkspacePermission[]): Promise<boolean> {
    if (!permissions.length) return await this.hasPermission(workspaceId, user, "workspace.read");
    if (!user) return false;
    if (this.env && isPlatformAdmin(this.env, user)) return true;
    const evaluation = await this.permissionEvaluationForUser(workspaceId, user.id);
    if (permissions.some((permission) => evaluation.denied.has(permission))) return false;
    if (evaluation.permissions.includes("workspace.admin")) return true;
    return permissions.every((permission) => evaluation.permissions.includes(permission));
  }

  async memberSummary(workspaceId: string, user: { id: string; email: string } | null) {
    if (!user) return { user: null, roles: [], permissions: [], bootstrap: false };
    if (this.env && isPlatformAdmin(this.env, user)) {
      return { user: { id: user.id, email: user.email }, roles: [], permissions: [...workspacePermissions], bootstrap: false, recoveryAdmin: true };
    }
    const rows = await this.db.prepare(`SELECT roles.name, roles.system_key
      FROM workspace_member_roles member_roles
      INNER JOIN workspace_roles roles ON roles.workspace_id = member_roles.workspace_id AND roles.id = member_roles.role_id
      WHERE member_roles.workspace_id = ? AND member_roles.user_id = ?
      ORDER BY roles.name`)
      .bind(workspaceId, user.id)
      .all<{ name: string; system_key: string | null }>();
    return { user: { id: user.id, email: user.email }, roles: rows.results, permissions: await this.effectivePermissionsForUser(workspaceId, user.id), bootstrap: false };
  }

  async accessibleWorkspaces(user: { id: string; email: string } | null): Promise<AccessibleWorkspace[]> {
    if (!user) return [];
    if (this.env && isPlatformAdmin(this.env, user)) {
      return (await this.workspaces()).map((workspace) => ({ id: workspace.id, name: workspace.name, status: workspace.status, roles: [], permissions: [...workspacePermissions] }));
    }
    const rows = await this.db.prepare(`SELECT members.workspace_id, workspaces.name, workspaces.status, roles.name AS role_name, roles.system_key, permissions.permission
      FROM workspace_members members
      INNER JOIN workspaces ON workspaces.id = members.workspace_id
      LEFT JOIN workspace_member_roles member_roles ON member_roles.workspace_id = members.workspace_id AND member_roles.user_id = members.user_id
      LEFT JOIN workspace_roles roles ON roles.workspace_id = member_roles.workspace_id AND roles.id = member_roles.role_id
      LEFT JOIN workspace_role_permissions permissions ON permissions.workspace_id = member_roles.workspace_id AND permissions.role_id = member_roles.role_id
      WHERE members.user_id = ? AND members.status = 'active'
      ORDER BY workspaces.name, roles.name, permissions.permission`)
      .bind(user.id)
      .all<{ workspace_id: string; name: string; status: AccessibleWorkspace["status"]; role_name: string | null; system_key: string | null; permission: WorkspacePermission | null }>();
    const workspaces = new Map<string, AccessibleWorkspace>();
    for (const row of rows.results) {
      const current = workspaces.get(row.workspace_id) ?? { id: row.workspace_id, name: row.name, status: row.status, roles: [], permissions: [] };
      if (row.role_name && !current.roles.some((role) => role.name === row.role_name && role.system_key === row.system_key)) current.roles.push({ name: row.role_name, system_key: row.system_key });
      if (row.permission && !current.permissions.includes(row.permission)) current.permissions.push(row.permission);
      workspaces.set(row.workspace_id, current);
    }
    return [...workspaces.values()].map((workspace) => ({ ...workspace, permissions: workspace.permissions.sort(), roles: workspace.roles.sort((left, right) => left.name.localeCompare(right.name)) }));
  }

  async workspaceMemberRecords(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const [memberRows, permissionRows, overrideRows] = await Promise.all([
      this.db.prepare(`SELECT members.user_id, members.email, members.status, roles.id AS role_id, roles.name, roles.system_key
        FROM workspace_members members
        LEFT JOIN workspace_member_roles member_roles ON member_roles.workspace_id = members.workspace_id AND member_roles.user_id = members.user_id
        LEFT JOIN workspace_roles roles ON roles.workspace_id = member_roles.workspace_id AND roles.id = member_roles.role_id
        WHERE members.workspace_id = ?
        ORDER BY members.updated_at DESC, members.email, roles.name`)
        .bind(workspaceId)
        .all<{ user_id: string; email: string | null; status: "active" | "invited" | "disabled"; role_id: string | null; name: string | null; system_key: string | null }>(),
      this.db.prepare(`SELECT DISTINCT member_roles.user_id, permissions.permission
        FROM workspace_member_roles member_roles
        INNER JOIN workspace_members members
          ON members.workspace_id = member_roles.workspace_id
          AND members.user_id = member_roles.user_id
          AND members.status = 'active'
        INNER JOIN workspace_role_permissions permissions
          ON permissions.workspace_id = member_roles.workspace_id
          AND permissions.role_id = member_roles.role_id
        WHERE member_roles.workspace_id = ?
        ORDER BY member_roles.user_id, permissions.permission`)
        .bind(workspaceId)
        .all<{ user_id: string; permission: WorkspacePermission }>(),
      this.db.prepare("SELECT user_id, permission, effect FROM workspace_member_permission_overrides WHERE workspace_id = ? ORDER BY user_id, permission")
        .bind(workspaceId)
        .all<{ user_id: string; permission: WorkspacePermission; effect: "allow" | "deny" }>(),
    ]);
    const members = new Map<string, WorkspaceMemberRecord>();
    for (const row of memberRows.results) {
      const current = members.get(row.user_id) ?? { user: { id: row.user_id, email: row.email }, status: row.status, roles: [], permissions: [], overrides: [] };
      if (row.role_id && row.name) current.roles.push({ id: row.role_id, name: row.name, systemKey: row.system_key });
      members.set(row.user_id, current);
    }
    for (const row of permissionRows.results) {
      const member = members.get(row.user_id);
      if (member && !member.permissions.includes(row.permission)) member.permissions.push(row.permission);
    }
    for (const override of overrideRows.results) {
      const member = members.get(override.user_id);
      if (!member) continue;
      member.overrides.push({ permission: override.permission, effect: override.effect });
      if (member.status !== "active") continue;
      if (override.effect === "deny") member.permissions = member.permissions.filter((permission) => permission !== override.permission);
      else if (!member.permissions.includes(override.permission)) member.permissions.push(override.permission);
    }
    for (const member of members.values()) {
      member.permissions.sort();
      member.overrides.sort((left, right) => left.permission.localeCompare(right.permission));
    }
    return Array.from(members.values());
  }

  async workspacePermissionsCatalog(workspaceId: string): Promise<WorkspacePermissionRecord[]> {
    const [roles, overrides] = await Promise.all([
      this.db.prepare("SELECT permission, COUNT(DISTINCT role_id) AS count FROM workspace_role_permissions WHERE workspace_id = ? GROUP BY permission").bind(workspaceId).all<{ permission: string; count: number }>(),
      this.db.prepare("SELECT permission, COUNT(DISTINCT user_id) AS count FROM workspace_member_permission_overrides WHERE workspace_id = ? GROUP BY permission").bind(workspaceId).all<{ permission: string; count: number }>(),
    ]);
    const roleCounts = new Map(roles.results.map((row) => [row.permission, row.count]));
    const overrideCounts = new Map(overrides.results.map((row) => [row.permission, row.count]));
    return workspacePermissions.map((permission) => ({ id: permission, name: permission, category: permission.split(".")[0] ?? "workspace", roleCount: roleCounts.get(permission) ?? 0, memberOverrideCount: overrideCounts.get(permission) ?? 0 }));
  }

  async settingsTab(workspaceId: string, tabId: string) {
    return this.resolveSettingsTab(workspaceId, tabId, new Set(workspacePermissions));
  }

  async reorderSettingsTabs(workspaceId: string, tabIds: string[]) {
    const tabs = await this.settingsTabs(workspaceId, new Set(workspacePermissions));
    const statements = tabIds.flatMap((tabId, index) => {
      const tab = tabs.find((item) => item.id === tabId);
      if (!tab) return [];
      return [this.db.prepare("UPDATE workspace_ui_activations SET order_index = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND plugin_id = ? AND contribution_id = ?").bind(index + 1, workspaceId, tab.pluginId, tab.panelContributionId)];
    });
    if (statements.length) await this.db.batch(statements);
  }

  async listSettings(workspaceId: string, scope: SettingScope) {
    return this.getSettings(workspaceId, scope);
  }

  async rbacOverview(workspaceId: string, user: { id: string; email: string } | null) {
    const [membership, roles, permissions, members, invitations] = await Promise.all([
      this.memberSummary(workspaceId, user),
      this.workspaceRoles(workspaceId),
      this.workspacePermissionsCatalog(workspaceId),
      this.workspaceMemberRecords(workspaceId),
      this.workspaceInvitations(workspaceId),
    ]);
    return { ...membership, roles: membership.roles, overview: { roles, permissions, members, invitations } };
  }

  async workspaceInvitations(workspaceId: string): Promise<WorkspaceInvitationRecord[]> {
    const rows = await this.db.prepare(`SELECT invites.id, invites.workspace_id, invites.email, invites.role_id, roles.name AS role_name, invites.status, invites.expires_at, invites.created_at, invites.updated_at
      FROM workspace_invitations invites
      LEFT JOIN workspace_roles roles ON roles.workspace_id = invites.workspace_id AND roles.id = invites.role_id
      WHERE invites.workspace_id = ? ORDER BY invites.created_at DESC`)
      .bind(workspaceId)
      .all<{ id: string; workspace_id: string; email: string; role_id: string | null; role_name: string | null; status: WorkspaceInvitationRecord["status"]; expires_at: string | null; created_at: string; updated_at: string }>();
    return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, email: row.email, roleId: row.role_id, roleName: row.role_name, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async createWorkspaceInvitation(workspaceId: string, input: { email: string; roleId?: string | null; expiresAt?: string | null }, actorId?: string) {
    await this.ensureWorkspaceRbac(workspaceId);
    const id = crypto.randomUUID();
    await this.db.prepare(`INSERT INTO workspace_invitations (id, workspace_id, email, role_id, status, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .bind(id, workspaceId, input.email.trim().toLowerCase(), input.roleId ?? null, input.expiresAt ?? null)
      .run();
    await this.audit(workspaceId, "workspace.invitation.create", { invitationId: id, email: input.email.trim().toLowerCase(), roleId: input.roleId ?? null }, actorId);
    return (await this.workspaceInvitations(workspaceId)).find((invite) => invite.id === id) ?? null;
  }

  async revokeWorkspaceInvitation(workspaceId: string, invitationId: string, actorId?: string) {
    await this.db.prepare("UPDATE workspace_invitations SET status = 'revoked', updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ? AND status = 'pending'").bind(workspaceId, invitationId).run();
    await this.audit(workspaceId, "workspace.invitation.revoke", { invitationId }, actorId);
    return (await this.workspaceInvitations(workspaceId)).find((invite) => invite.id === invitationId) ?? null;
  }

  async deleteWorkspaceInvitation(workspaceId: string, invitationId: string, actorId?: string) {
    await this.db.prepare("DELETE FROM workspace_invitations WHERE workspace_id = ? AND id = ?").bind(workspaceId, invitationId).run();
    await this.audit(workspaceId, "workspace.invitation.delete", { invitationId }, actorId);
    return true;
  }

  async workspaceRoles(workspaceId: string): Promise<WorkspaceRoleRecord[]> {
    const [roles, permissionRows] = await Promise.all([
      this.db.prepare(`SELECT id, name, system_key, description
        FROM workspace_roles
        WHERE workspace_id = ?
        ORDER BY system_key IS NULL, name`)
        .bind(workspaceId)
        .all<{ id: string; name: string; system_key: string | null; description: string | null }>(),
      this.db.prepare("SELECT role_id, permission FROM workspace_role_permissions WHERE workspace_id = ? ORDER BY role_id, permission")
        .bind(workspaceId)
        .all<{ role_id: string; permission: string }>(),
    ]);
    const permissionsByRole = new Map<string, string[]>();
    for (const row of permissionRows.results) {
      const permissions = permissionsByRole.get(row.role_id) ?? [];
      permissions.push(row.permission);
      permissionsByRole.set(row.role_id, permissions);
    }
    return roles.results.map((role) => ({
      id: role.id,
      name: role.name,
      systemKey: role.system_key,
      description: role.description,
      permissions: permissionsByRole.get(role.id) ?? [],
    }));
  }

  async rolePermissionsFor(workspaceId: string, roleId: string) {
    const rows = await this.db.prepare("SELECT permission FROM workspace_role_permissions WHERE workspace_id = ? AND role_id = ? ORDER BY permission")
      .bind(workspaceId, roleId)
      .all<{ permission: string }>();
    return rows.results.map((row) => row.permission);
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

  async assignWorkspaceMemberRoles(workspaceId: string, userId: string, roleIds: string[], actorId?: string) {
    await this.ensureWorkspaceRbac(workspaceId);
    const target = await this.authUserById(userId);
    if (target?.isPlatformAdmin) throw new Error("Platform Superadmin accounts are protected and cannot be assigned workspace memberships.");
    const existing = await this.db.prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1").bind(workspaceId, userId).first<{ user_id: string }>();
    const email = target?.email ?? null;
    await this.db.batch([
      this.db.prepare(`INSERT INTO workspace_members (workspace_id, user_id, email, status, updated_at)
        VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id, user_id) DO UPDATE SET email = COALESCE(excluded.email, workspace_members.email), status = 'active', updated_at = CURRENT_TIMESTAMP`)
        .bind(workspaceId, userId, email),
      ...roleIds.map((roleId) => this.db.prepare("INSERT OR IGNORE INTO workspace_member_roles (workspace_id, user_id, role_id) VALUES (?, ?, ?)").bind(workspaceId, userId, roleId)),
    ]);
    await this.audit(workspaceId, "rbac.member.roles.assign", { userId, roleIds, createdMembership: !existing }, actorId);
    return this.workspaceMemberRecords(workspaceId);
  }

  async removeWorkspaceMemberRoles(workspaceId: string, userId: string, roleIds: string[], actorId?: string) {
    const target = await this.authUserById(userId);
    if (target?.isPlatformAdmin) throw new Error("Platform Superadmin accounts are protected and cannot be removed from workspace roles.");
    const currentMember = (await this.workspaceMemberRecords(workspaceId)).find((item) => item.user.id === userId);
    const removingOwner = currentMember?.roles.some((role) => role.systemKey === "owner" && roleIds.includes(role.id));
    if (removingOwner && await this.workspaceOwnerCount(workspaceId) <= 1) throw new Error("The last active Owner of a workspace cannot be demoted.");
    await this.db.batch(roleIds.map((roleId) => this.db.prepare("DELETE FROM workspace_member_roles WHERE workspace_id = ? AND user_id = ? AND role_id = ?").bind(workspaceId, userId, roleId)));
    await this.audit(workspaceId, "rbac.member.roles.remove", { userId, roleIds }, actorId);
    return this.workspaceMemberRecords(workspaceId);
  }

  async removeWorkspaceMember(workspaceId: string, userId: string, actorId?: string) {
    const target = await this.authUserById(userId);
    if (target?.isPlatformAdmin) throw new Error("Platform Superadmin accounts are protected and cannot be removed from workspace memberships.");
    const currentMember = (await this.workspaceMemberRecords(workspaceId)).find((item) => item.user.id === userId);
    if (currentMember?.roles.some((role) => role.systemKey === "owner") && await this.workspaceOwnerCount(workspaceId) <= 1) {
      throw new Error("The last active Owner of a workspace cannot be removed.");
    }
    await this.db.batch([
      this.db.prepare("DELETE FROM workspace_member_permission_overrides WHERE workspace_id = ? AND user_id = ?").bind(workspaceId, userId),
      this.db.prepare("DELETE FROM workspace_member_roles WHERE workspace_id = ? AND user_id = ?").bind(workspaceId, userId),
      this.db.prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?").bind(workspaceId, userId),
    ]);
    await this.audit(workspaceId, "rbac.member.remove", { userId }, actorId);
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

  async audit(workspaceId: string | null, action: string, payload: Record<string, unknown>, actorId?: string) {
    await this.db.prepare("INSERT INTO audit_events (id, workspace_id, actor_id, action, payload_json) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), workspaceId, actorId ?? null, action, JSON.stringify(payload))
      .run();
  }

  async auditEvents(workspaceId: string) {
    const rows = await this.db.prepare("SELECT id, workspace_id, actor_id, action, payload_json, created_at FROM audit_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200")
      .bind(workspaceId)
      .all<AuditEventRow>();
    return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, actorId: row.actor_id, action: row.action, payload: safeJson<Record<string, unknown> | null>(row.payload_json, null), createdAt: row.created_at }));
  }

  async workspaceAuditPolicy(workspaceId: string): Promise<WorkspaceAuditPolicyRecord> {
    const settings = await this.getSettings(workspaceId, "platform");
    const raw = settings.auditPolicy;
    const categories = raw && typeof raw === "object" && "categories" in raw ? (raw as { categories?: unknown }).categories : raw;
    const value = categories && typeof categories === "object" ? categories as Record<string, unknown> : {};
    return {
      auth: typeof value.auth === "boolean" ? value.auth : true,
      core: typeof value.core === "boolean" ? value.core : true,
      plugin: typeof value.plugin === "boolean" ? value.plugin : true,
      shell: typeof value.shell === "boolean" ? value.shell : true,
    };
  }

  async saveWorkspaceAuditPolicy(workspaceId: string, policy: WorkspaceAuditPolicyRecord, actorId?: string) {
    await this.saveSetting(workspaceId, "platform", "auditPolicy", { categories: policy });
    await this.audit(workspaceId, "settings.audit.policy.update", { categories: policy }, actorId);
    return this.workspaceAuditPolicy(workspaceId);
  }

  async listDomains(workspaceId: string): Promise<WorkspaceDomain[]> {
    const rows = await this.db.prepare("SELECT id, workspace_id, hostname, kind, status, verification_method, verification_instructions_json, publication_id, is_primary, created_at, verified_at, updated_at FROM workspace_domains WHERE workspace_id = ? ORDER BY is_primary DESC, hostname")
      .bind(workspaceId)
      .all<{ id: string; workspace_id: string; hostname: string; kind: WorkspaceDomain["kind"]; status: WorkspaceDomain["status"]; verification_method: WorkspaceDomain["verificationMethod"]; verification_instructions_json: string | null; publication_id: string | null; is_primary: number; created_at: string; verified_at: string | null; updated_at: string }>();
    return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, hostname: row.hostname, kind: row.kind, status: row.status, verificationMethod: row.verification_method, verificationInstructions: safeJson<Record<string, unknown> | null>(row.verification_instructions_json, null), publicationId: row.publication_id, isPrimary: row.is_primary === 1, createdAt: row.created_at, verifiedAt: row.verified_at, updatedAt: row.updated_at }));
  }

  async activeDomains(workspaceId: string, kinds: WorkspaceDomain["kind"][]) {
    const allowedKinds = new Set(kinds);
    return (await this.listDomains(workspaceId)).filter((domain) => allowedKinds.has(domain.kind) && (domain.status === "active" || domain.status === "verified"));
  }

  async createDomain(workspaceId: string, input: { hostname: string; kind: WorkspaceDomain["kind"]; verificationMethod: WorkspaceDomain["verificationMethod"]; isPrimary?: boolean }, actorId?: string) {
    const id = crypto.randomUUID();
    const hostname = input.hostname.trim().toLowerCase();
    const token = crypto.randomUUID().replaceAll("-", "");
    const instructions = input.verificationMethod === "dns-cname"
      ? { cnameRecord: `_v2-verify.${hostname}`, target: `${token}.verify.v2.invalid` }
      : input.verificationMethod === "dns-txt"
        ? { txtRecord: `_v2-verify.${hostname}`, token }
        : { recoveryOnly: true };
    await this.db.prepare(`INSERT INTO workspace_domains (id, workspace_id, hostname, kind, status, verification_method, verification_instructions_json, is_primary, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(id, workspaceId, hostname, input.kind, input.verificationMethod, JSON.stringify(instructions), input.isPrimary ? 1 : 0)
      .run();
    await this.audit(workspaceId, "domain.create", { domainId: id, hostname, kind: input.kind }, actorId);
    return (await this.listDomains(workspaceId)).find((domain) => domain.id === id) ?? null;
  }

  async updateDomainStatus(workspaceId: string, id: string, status: WorkspaceDomain["status"], actorId?: string) {
    await this.db.prepare("UPDATE workspace_domains SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?").bind(status, workspaceId, id).run();
    await this.audit(workspaceId, `domain.${status}`, { domainId: id }, actorId);
    return (await this.listDomains(workspaceId)).find((domain) => domain.id === id) ?? null;
  }

  async verifyDomain(workspaceId: string, id: string, actorId?: string) {
    await this.db.prepare("UPDATE workspace_domains SET status = 'verified', verified_at = COALESCE(verified_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?").bind(workspaceId, id).run();
    await this.audit(workspaceId, "domain.verify", { domainId: id }, actorId);
    return (await this.listDomains(workspaceId)).find((domain) => domain.id === id) ?? null;
  }

  async activateDomain(workspaceId: string, id: string, actorId?: string) {
    return this.updateDomainStatus(workspaceId, id, "active", actorId);
  }

  async disableDomain(workspaceId: string, id: string, actorId?: string) {
    return this.updateDomainStatus(workspaceId, id, "disabled", actorId);
  }

  async mailSummary(workspaceId: string) {
    const [providers, templates, events] = await Promise.all([this.listMailProviders(workspaceId), this.listMailTemplates(workspaceId), this.listMailEvents(workspaceId)]);
    return { activeProvider: providers.find((provider) => provider.status === "active" && provider.enabled) ?? null, providers, templates, events };
  }

  async listMailProviders(workspaceId: string): Promise<MailProviderPublicSummary[]> {
    const rows = await this.db.prepare("SELECT id, workspace_id, kind, label, status, enabled, from_name, from_email, reply_to_email, configuration_ref, safe_config_json, is_default_transactional, last_tested_at, last_test_status, last_error, created_at, updated_at FROM workspace_mail_providers WHERE workspace_id = ? ORDER BY is_default_transactional DESC, label")
      .bind(workspaceId).all<MailProviderRow>();
    return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, kind: row.kind, label: row.label, status: row.status, enabled: row.enabled === 1, fromName: row.from_name, fromEmail: row.from_email, replyToEmail: row.reply_to_email, safeConfig: safeJson(row.safe_config_json, { usernameConfigured: false, passwordConfigured: false, secretHint: null }), isDefaultTransactional: row.is_default_transactional === 1, lastTestedAt: row.last_tested_at, lastTestStatus: row.last_test_status, lastError: row.last_error, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async activeMailProvider(workspaceId: string) {
    const row = await this.db.prepare("SELECT id, workspace_id, kind, label, status, enabled, from_name, from_email, reply_to_email, configuration_ref, safe_config_json, is_default_transactional, last_tested_at, last_test_status, last_error, created_at, updated_at FROM workspace_mail_providers WHERE workspace_id = ? AND status = 'active' AND enabled = 1 ORDER BY is_default_transactional DESC LIMIT 1")
      .bind(workspaceId).first<MailProviderRow>();
    if (!row) return null;
    return { id: row.id, workspaceId: row.workspace_id, kind: row.kind, label: row.label, status: row.status, enabled: row.enabled === 1, fromName: row.from_name, fromEmail: row.from_email, replyToEmail: row.reply_to_email, safeConfig: safeJson(row.safe_config_json, { usernameConfigured: false, passwordConfigured: false, secretHint: null }), configurationRef: row.configuration_ref, configured: Boolean(row.configuration_ref), isDefaultTransactional: row.is_default_transactional === 1, lastTestedAt: row.last_tested_at, lastTestStatus: row.last_test_status, lastError: row.last_error, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async saveMailProvider(workspaceId: string, input: MailProviderConfigure, actorId?: string) {
    const id = crypto.randomUUID();
    await this.db.prepare(`INSERT INTO workspace_mail_providers (id, workspace_id, kind, label, status, enabled, from_name, from_email, reply_to_email, configuration_ref, safe_config_json, updated_at)
      VALUES (?, ?, ?, ?, 'configured', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(id, workspaceId, input.kind, input.label, input.enabled ? 1 : 0, input.fromName, input.fromEmail, input.replyToEmail ?? null, input.configurationRef ?? null, JSON.stringify(input.safeConfig))
      .run();
    await this.audit(workspaceId, "mail.provider.configure", { providerId: id, kind: input.kind, label: input.label }, actorId);
    return (await this.listMailProviders(workspaceId)).find((provider) => provider.id === id) ?? null;
  }

  async activateMailProvider(workspaceId: string, id: string, actorId?: string) {
    await this.db.batch([
      this.db.prepare("UPDATE workspace_mail_providers SET status = 'configured', is_default_transactional = 0, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND status = 'active'").bind(workspaceId),
      this.db.prepare("UPDATE workspace_mail_providers SET status = 'active', enabled = 1, is_default_transactional = 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?").bind(workspaceId, id),
    ]);
    await this.audit(workspaceId, "mail.provider.activate", { providerId: id }, actorId);
    return (await this.listMailProviders(workspaceId)).find((provider) => provider.id === id) ?? null;
  }

  async disableMailProvider(workspaceId: string, id: string, actorId?: string) {
    await this.db.prepare("UPDATE workspace_mail_providers SET status = 'disabled', enabled = 0, is_default_transactional = 0, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?").bind(workspaceId, id).run();
    await this.audit(workspaceId, "mail.provider.disable", { providerId: id }, actorId);
    return (await this.listMailProviders(workspaceId)).find((provider) => provider.id === id) ?? null;
  }

  async listMailTemplates(workspaceId: string): Promise<MailTemplate[]> {
    const rows = await this.db.prepare("SELECT id, workspace_id, template_key, subject_template, body_text_template, body_html_template, status, locale, created_at, updated_at FROM workspace_mail_templates WHERE workspace_id = ? ORDER BY template_key, locale")
      .bind(workspaceId).all<{ id: string; workspace_id: string; template_key: MailTemplate["templateKey"]; subject_template: string; body_text_template: string; body_html_template: string | null; status: MailTemplate["status"]; locale: string; created_at: string; updated_at: string }>();
    return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, templateKey: row.template_key, subjectTemplate: row.subject_template, bodyTextTemplate: row.body_text_template, bodyHtmlTemplate: row.body_html_template, status: row.status, locale: row.locale, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async listMailEvents(workspaceId: string) {
    const rows = await this.db.prepare("SELECT id, workspace_id, provider_id, template_key, recipient_hash_or_safe_reference, status, purpose, error_safe, audit_event_id, created_at, completed_at FROM mail_delivery_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100")
      .bind(workspaceId).all<{ id: string; workspace_id: string; provider_id: string | null; template_key: MailTemplate["templateKey"] | null; recipient_hash_or_safe_reference: string; status: "queued" | "sent" | "failed"; purpose: string; error_safe: string | null; audit_event_id: string | null; created_at: string; completed_at: string | null }>();
    return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, providerId: row.provider_id, templateKey: row.template_key, recipientHashOrSafeReference: row.recipient_hash_or_safe_reference, status: row.status, purpose: row.purpose, errorSafe: row.error_safe, auditEventId: row.audit_event_id, createdAt: row.created_at, completedAt: row.completed_at }));
  }

  async sendMail(workspaceId: string, request: MailMessageRequest, actorId?: string): Promise<MailDeliveryResult> {
    const provider = await this.activeMailProvider(workspaceId);
    if (!provider) return { ok: false, status: "failed", eventId: crypto.randomUUID(), providerId: null, errorSafe: "No active mail provider is configured." };
    const template = request.templateKey ? (await this.listMailTemplates(workspaceId)).find((item) => item.templateKey === request.templateKey && item.status === "active") : undefined;
    const subject = request.subject ?? (template ? interpolate(template.subjectTemplate, request.variables ?? {}) : "Notification");
    const text = request.text ?? (template ? interpolate(template.bodyTextTemplate, request.variables ?? {}) : "");
    const html = request.html ?? (template?.bodyHtmlTemplate ? interpolate(template.bodyHtmlTemplate, request.variables ?? {}) : undefined);
    const { html: _requestHtml, ...baseRequest } = request;
    const eventId = crypto.randomUUID();
    const safeRecipient = `to:${request.to.trim().toLowerCase().slice(0, 3)}***`;
    await this.db.prepare("INSERT INTO mail_delivery_events (id, workspace_id, provider_id, template_key, recipient_hash_or_safe_reference, status, purpose) VALUES (?, ?, ?, ?, ?, 'queued', ?)")
      .bind(eventId, workspaceId, provider.id, request.templateKey ?? null, safeRecipient, request.purpose)
      .run();
    const message = html === undefined ? { ...baseRequest, subject, text } : { ...baseRequest, subject, text, html };
    const result = await new CoreMailDeliveryAdapter(this.env).deliver(provider, message);
    if (!result.ok) {
      await this.db.prepare("UPDATE mail_delivery_events SET status = 'failed', error_safe = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(result.errorSafe ?? "Delivery failed.", eventId).run();
      await this.audit(workspaceId, "mail.delivery.failed", { eventId, providerId: provider.id, purpose: request.purpose }, actorId);
      return { ok: false, status: "failed", eventId, providerId: provider.id, errorSafe: result.errorSafe ?? "Delivery failed." };
    }
    await this.db.prepare("UPDATE mail_delivery_events SET status = 'sent', completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(eventId).run();
    await this.audit(workspaceId, "mail.delivery.sent", { eventId, providerId: provider.id, purpose: request.purpose }, actorId);
    return { ok: true, status: "sent", eventId, providerId: provider.id, errorSafe: null };
  }

  async testMailProvider(workspaceId: string, id: string, to: string, actorId?: string) {
    await this.activateMailProvider(workspaceId, id, actorId);
    return this.sendMail(workspaceId, { workspaceId, to, subject: "v2 mail provider test", text: "Your mail provider is configured.", purpose: "test", variables: {} }, actorId);
  }

  async declaredCapabilities(pluginId: string) {
    const rows = await this.db.prepare("SELECT capability_id FROM plugin_capabilities WHERE plugin_id = ? ORDER BY capability_id").bind(pluginId).all<{ capability_id: string }>();
    return rows.results.map((row) => row.capability_id);
  }

  async grantedCapabilities(workspaceId: string, pluginId: string) {
    const rows = await this.db.prepare("SELECT capability_id FROM workspace_capability_grants WHERE workspace_id = ? AND plugin_id = ? ORDER BY capability_id").bind(workspaceId, pluginId).all<{ capability_id: string }>();
    return rows.results.map((row) => row.capability_id);
  }

  async grantCapabilities(workspaceId: string, pluginId: string, capabilities: string[]) {
    const uniqueCapabilities = [...new Set(capabilities.filter((capability) => typeof capability === "string" && capability.trim()))];
    await this.db.batch(uniqueCapabilities.map((capability) => this.db.prepare("INSERT INTO workspace_capability_grants (workspace_id, plugin_id, capability_id, granted_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, plugin_id, capability_id) DO UPDATE SET granted_at = CURRENT_TIMESTAMP").bind(workspaceId, pluginId, capability)));
    await this.audit(workspaceId, "plugin.capability.grant", { pluginId, capabilities: uniqueCapabilities }, undefined);
    return this.grantedCapabilities(workspaceId, pluginId);
  }

  async catalogPlugins(): Promise<CatalogPlugin[]> {
    const rows = await this.db.prepare("SELECT plugin_id, manifest_json, category, demo_available, source FROM plugin_catalog ORDER BY category, name").all<{ plugin_id: string; manifest_json: string; category: string; demo_available: number; source: string }>();
    return rows.results.map((row) => ({ manifest: pluginManifestSchema.parse(JSON.parse(row.manifest_json)), category: row.category, demoAvailable: row.demo_available === 1, source: row.source }));
  }

  async catalogPlugin(pluginId: string) {
    return (await this.catalogPlugins()).find((entry) => entry.manifest.id === pluginId);
  }

  async publishedCatalogRelease(pluginId: string): Promise<CatalogRelease | null> {
    const row = await this.db.prepare("SELECT id, plugin_id, version, manifest_json, package_object_key, sha256, size_bytes, format, worker_isolation, ui_mode, status, source FROM plugin_catalog_releases WHERE plugin_id = ? AND status = 'published' ORDER BY published_at DESC, updated_at DESC LIMIT 1").bind(pluginId).first<{ id: string; plugin_id: string; version: string; manifest_json: string; package_object_key: string; sha256: string; size_bytes: number; format: string; worker_isolation: PluginBundle["worker"]["isolation"]; ui_mode: PluginBundle["ui"]["mode"]; status: CatalogRelease["status"]; source: string }>();
    return row ? { id: row.id, pluginId: row.plugin_id, version: row.version, manifest: pluginManifestSchema.parse(JSON.parse(row.manifest_json)), packageObjectKey: row.package_object_key, sha256: row.sha256, sizeBytes: row.size_bytes, format: "zip", workerIsolation: row.worker_isolation, uiMode: row.ui_mode, status: row.status, source: row.source } : null;
  }

  async catalogRelease(pluginId: string, releaseId: string): Promise<CatalogRelease | null> {
    const row = await this.db.prepare("SELECT id, plugin_id, version, manifest_json, package_object_key, sha256, size_bytes, format, worker_isolation, ui_mode, status, source FROM plugin_catalog_releases WHERE plugin_id = ? AND id = ? AND status = 'published' LIMIT 1")
      .bind(pluginId, releaseId)
      .first<{ id: string; plugin_id: string; version: string; manifest_json: string; package_object_key: string; sha256: string; size_bytes: number; format: string; worker_isolation: PluginBundle["worker"]["isolation"]; ui_mode: PluginBundle["ui"]["mode"]; status: CatalogRelease["status"]; source: string }>();
    return row ? { id: row.id, pluginId: row.plugin_id, version: row.version, manifest: pluginManifestSchema.parse(JSON.parse(row.manifest_json)), packageObjectKey: row.package_object_key, sha256: row.sha256, sizeBytes: row.size_bytes, format: "zip", workerIsolation: row.worker_isolation, uiMode: row.ui_mode, status: row.status, source: row.source } : null;
  }

  async catalogReleaseOptions(pluginId: string): Promise<CatalogReleaseOption[]> {
    const rows = await this.db.prepare("SELECT id, version, sha256, size_bytes, worker_isolation, ui_mode, status, source FROM plugin_catalog_releases WHERE plugin_id = ? AND status = 'published' ORDER BY published_at DESC, updated_at DESC")
      .bind(pluginId)
      .all<{ id: string; version: string; sha256: string; size_bytes: number; worker_isolation: PluginBundle["worker"]["isolation"]; ui_mode: PluginBundle["ui"]["mode"]; status: CatalogRelease["status"]; source: string }>();
    return rows.results.map((row) => ({
      id: row.id,
      releaseId: row.id,
      version: row.version,
      label: `v${row.version}`,
      status: row.status,
      source: row.source,
      sha256: row.sha256,
      workerIsolation: row.worker_isolation,
      uiMode: row.ui_mode,
      sizeBytes: row.size_bytes,
    }));
  }

  releaseBundle(release: CatalogRelease): PluginBundle {
    return { manifest: release.manifest, package: { objectKey: release.packageObjectKey, sha256: release.sha256, sizeBytes: release.sizeBytes, format: release.format }, worker: { isolation: release.workerIsolation }, ui: { mode: release.uiMode } };
  }

  async installed() {
    const rows = await this.db.prepare("SELECT manifest_json FROM installed_plugins ORDER BY id").all<{ manifest_json: string }>();
    return rows.results.map((row) => pluginManifestSchema.parse(JSON.parse(row.manifest_json)));
  }

  async installedById(id: string) {
    const row = await this.db.prepare("SELECT manifest_json FROM installed_plugins WHERE id = ?").bind(id).first<{ manifest_json: string }>();
    return row ? pluginManifestSchema.parse(JSON.parse(row.manifest_json)) : undefined;
  }

  async workspacePlugins(workspaceId: string): Promise<PluginWorkspaceState[]> {
    const rows = await this.db.prepare("SELECT workspace_id, plugin_id, active, updated_at FROM workspace_plugins WHERE workspace_id = ? ORDER BY plugin_id").bind(workspaceId).all<{ workspace_id: string; plugin_id: string; active: number; updated_at: string }>();
    return rows.results.map((row) => ({ workspaceId: row.workspace_id, pluginId: row.plugin_id, active: row.active === 1, updatedAt: row.updated_at }));
  }

  async workspaceInstalled(workspaceId: string) {
    const states = await this.workspacePlugins(workspaceId);
    const plugins = await this.installed();
    const allowed = new Set(states.map((state) => state.pluginId));
    return plugins.filter((plugin) => allowed.has(plugin.id));
  }

  async pluginCatalogRows(workspaceId: string) {
    const catalog = await this.catalogPlugins();
    const states = await this.workspacePlugins(workspaceId);
    const stateByPluginId = new Map(states.map((state) => [state.pluginId, state]));
    const releases = await Promise.all(catalog.map((entry) => this.publishedCatalogRelease(entry.manifest.id)));
    const releaseByPluginId = new Map(releases.filter((release): release is CatalogRelease => Boolean(release)).map((release) => [release.pluginId, release]));
    return Promise.all(catalog.map(async (entry) => {
      const state = stateByPluginId.get(entry.manifest.id);
      const release = releaseByPluginId.get(entry.manifest.id);
      const releaseOptions = await this.catalogReleaseOptions(entry.manifest.id);
      const deployment = state ? await this.pluginRuntimeDeployment(workspaceId, entry.manifest.id) : null;
      const demoOperation = entry.manifest.api.operations.find((operation) => /demo/i.test(operation.id) && /install|seed/i.test(operation.id));
      return {
      id: entry.manifest.id,
      pluginId: entry.manifest.id,
      name: entry.manifest.name,
      description: `${entry.category} plugin from ${entry.source}`,
      category: entry.category,
      scope: entry.source === "official" ? "global" : "workspace",
      version: release?.version ?? entry.manifest.version,
      releaseId: release?.id ?? "",
      activeReleaseId: deployment?.releaseId ?? "",
      latestReleaseId: release?.id ?? "",
      latestVersion: release?.version ?? entry.manifest.version,
      releases: releaseOptions,
      releaseOptions,
      installed: state ? "Installed" : "Available",
      installedFlag: Boolean(state),
      active: state?.active ? "Enabled" : "Disabled",
      activeFlag: state?.active === true,
      runtimeStatus: deployment?.runtimeStatus ?? (state ? "pending" : "not installed"),
      runtimeKind: deployment?.runtimeKind ?? (state ? "none" : "not installed"),
      runtimeKey: deployment?.runtimeKey ?? "",
      deployedVersion: deployment?.deployedVersion ?? "",
      provisioningTarget: deployment?.runtimeKind ?? "core-default",
      provisioningTargetOptions: [
        { value: "core-default", label: "Core default" },
        { value: "local-dev", label: "Local dev" },
        { value: "dispatch-namespace", label: "Cloudflare Dispatch namespace" },
      ],
      demoAvailable: entry.demoAvailable ? "Yes" : "No",
      demoAvailableFlag: entry.demoAvailable,
      demoInstallOperationId: demoOperation?.id ?? "",
      demoInstalled: "Unknown",
      demoInstalledFlag: false,
      source: entry.source,
    };
    }));
  }

  async pluginInstalledRows(workspaceId: string) {
    const states = await this.workspacePlugins(workspaceId);
    const plugins = await this.db.prepare("SELECT id, name, version, worker_isolation FROM installed_plugins ORDER BY id").all<{ id: string; name: string; version: string; worker_isolation: string }>();
    const pluginById = new Map(plugins.results.map((plugin) => [plugin.id, plugin]));
    return states
      .map((state) => {
        const plugin = pluginById.get(state.pluginId);
        if (!plugin) return undefined;
        return {
          id: plugin.id,
          name: plugin.name,
          version: plugin.version,
          active: state.active ? "Active" : "Inactive",
          workerIsolation: plugin.worker_isolation,
        };
      })
      .filter((item): item is { id: string; name: string; version: string; active: string; workerIsolation: string } => Boolean(item));
  }

  async activePlugins(workspaceId: string) {
    return (await this.workspacePlugins(workspaceId)).filter((state) => state.active).map((state) => state.pluginId);
  }

  async activate(workspaceId: string, pluginId: string) {
    if (!await this.installedById(pluginId)) return undefined;
    const now = new Date().toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT INTO workspace_plugins (workspace_id, plugin_id, active, activated_at, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET active = 1, activated_at = excluded.activated_at, updated_at = excluded.updated_at`).bind(workspaceId, pluginId, now, now),
      this.db.prepare(`UPDATE plugin_runtime_deployments SET runtime_status = 'active', activated_at = COALESCE(activated_at, ?), updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND plugin_id = ? AND runtime_status IN ('pending', 'provisioning', 'deployed', 'active')`).bind(now, workspaceId, pluginId),
    ]);
    return { workspaceId, pluginId, active: true, updatedAt: now } satisfies PluginWorkspaceState;
  }

  async deactivate(workspaceId: string, pluginId: string) {
    const now = new Date().toISOString();
    const row = await this.db.prepare("SELECT plugin_id FROM workspace_plugins WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId).first<{ plugin_id: string }>();
    if (!row) return undefined;
    await this.db.batch([
      this.db.prepare("UPDATE workspace_plugins SET active = 0, updated_at = ? WHERE workspace_id = ? AND plugin_id = ?").bind(now, workspaceId, pluginId),
      this.db.prepare("UPDATE plugin_runtime_deployments SET runtime_status = 'disabled', disabled_at = COALESCE(disabled_at, ?), updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND plugin_id = ? AND runtime_status <> 'deleted'").bind(now, workspaceId, pluginId),
    ]);
    return { workspaceId, pluginId, active: false, updatedAt: now } satisfies PluginWorkspaceState;
  }

  async uninstall(workspaceId: string, pluginId: string) {
    const now = new Date().toISOString();
    const row = await this.db.prepare("SELECT plugin_id FROM workspace_plugins WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId).first<{ plugin_id: string }>();
    if (!row) return undefined;
    await this.db.batch([
      this.db.prepare("DELETE FROM workspace_plugins WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId),
      this.db.prepare("UPDATE plugin_runtime_deployments SET runtime_status = 'deleted', disabled_at = COALESCE(disabled_at, ?), updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND plugin_id = ?").bind(now, workspaceId, pluginId),
      this.db.prepare("DELETE FROM workspace_capability_grants WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId),
      this.db.prepare("DELETE FROM workspace_ui_activations WHERE workspace_id = ? AND plugin_id = ?").bind(workspaceId, pluginId),
    ]);
    return { workspaceId, pluginId, active: false, updatedAt: now } satisfies PluginWorkspaceState;
  }

  async updateRuntimeDeployment(input: { workspaceId: string; pluginId: string; releaseId: string; runtimeKey: string; runtimeKind: PluginRuntimeDeployment["runtimeKind"]; runtimeStatus: PluginRuntimeDeployment["runtimeStatus"]; deployedVersion?: string | null; deploymentId?: string | null; activatedAt?: string | null; disabledAt?: string | null; lastError?: string | null }) {
    await this.db.prepare(`INSERT INTO plugin_runtime_deployments (workspace_id, plugin_id, release_id, runtime_key, runtime_kind, runtime_status, deployed_version, deployment_id, activated_at, disabled_at, last_error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, plugin_id) DO UPDATE SET release_id = excluded.release_id, runtime_key = excluded.runtime_key, runtime_kind = excluded.runtime_kind, runtime_status = excluded.runtime_status, deployed_version = excluded.deployed_version, deployment_id = excluded.deployment_id, activated_at = excluded.activated_at, disabled_at = excluded.disabled_at, last_error = excluded.last_error, updated_at = CURRENT_TIMESTAMP`)
      .bind(input.workspaceId, input.pluginId, input.releaseId, input.runtimeKey, input.runtimeKind, input.runtimeStatus, input.deployedVersion ?? null, input.deploymentId ?? null, input.activatedAt ?? null, input.disabledAt ?? null, input.lastError ?? null)
      .run();
    return this.pluginRuntimeDeployment(input.workspaceId, input.pluginId);
  }

  async upsertPluginRuntimeDeployment(input: { workspaceId: string; pluginId: string; releaseId: string; runtimeKey: string; runtimeKind: PluginRuntimeDeployment["runtimeKind"]; runtimeStatus: PluginRuntimeDeployment["runtimeStatus"]; deployedVersion?: string | null; deploymentId?: string | null; activatedAt?: string | null; disabledAt?: string | null; lastError?: string | null }) {
    return this.updateRuntimeDeployment(input);
  }

  async pluginRuntimeDeployment(workspaceId: string, pluginId: string): Promise<PluginRuntimeDeployment | null> {
    const row = await this.db.prepare("SELECT workspace_id, plugin_id, release_id, runtime_key, runtime_kind, runtime_status, deployed_version, deployment_id, created_at, activated_at, disabled_at, last_error FROM plugin_runtime_deployments WHERE workspace_id = ? AND plugin_id = ? LIMIT 1")
      .bind(workspaceId, pluginId)
      .first<{ workspace_id: string; plugin_id: string; release_id: string; runtime_key: string; runtime_kind: PluginRuntimeDeployment["runtimeKind"]; runtime_status: PluginRuntimeDeployment["runtimeStatus"]; deployed_version: string | null; deployment_id: string | null; created_at: string; activated_at: string | null; disabled_at: string | null; last_error: string | null }>();
    return row ? { workspaceId: row.workspace_id, pluginId: row.plugin_id, releaseId: row.release_id, runtimeKey: row.runtime_key, runtimeKind: row.runtime_kind, runtimeStatus: row.runtime_status, deployedVersion: row.deployed_version, deploymentId: row.deployment_id, createdAt: row.created_at, activatedAt: row.activated_at, disabledAt: row.disabled_at, lastError: row.last_error } : null;
  }

  async activePluginRuntime(workspaceId: string, pluginId: string) {
    const deployment = await this.pluginRuntimeDeployment(workspaceId, pluginId);
    return deployment && (deployment.runtimeStatus === "active" || deployment.runtimeStatus === "deployed") ? deployment : null;
  }

  private uiContributionsFor(manifest: PluginManifest) {
    const complete = <T extends Omit<PluginUiContribution, "defaultPath" | "label" | "icon" | "navigationSection" | "rendererMode" | "componentId" | "configurable" | "source" | "displayOrder"> & Partial<Pick<PluginUiContribution, "source" | "displayOrder">>>(value: T): PluginUiContribution => ({
      ...value,
      source: value.source ?? "plugin",
      displayOrder: value.displayOrder ?? 0,
      defaultPath: null,
      label: value.schema.title,
      icon: null,
      navigationSection: null,
      rendererMode: "declarative",
      componentId: null,
      configurable: config(false),
    });
    const declarativeSurfacePage = (surface: PluginManifest["contributes"]["surfaces"][number]) => {
      const renderer = surface.renderer.mode === "declarative" ? surface.renderer.schema : undefined;
      if (renderer && typeof renderer === "object" && "templateId" in renderer) return declarativePageContributionSchema.parse(renderer as Record<string, unknown>);
      return declarativePageContributionSchema.parse({
        id: surface.id,
        title: surface.title,
        templateId: surface.kind === "settings" ? "admin.settings" : "admin.dashboard",
        access: surface.kind === "settings" ? "permission-gated" : "private",
        ...(surface.renderer.mode === "sandbox-frame" ? { data: { rendererType: "sandbox-frame", sandbox: surface.renderer } } : {}),
      });
    };
    const surfaces = manifest.contributes.surfaces.flatMap((surface) => {
      const page = declarativeSurfacePage(surface);
      return [complete({
        pluginId: manifest.id,
        contributionId: surface.id,
        contributionType: "surface" as const,
        source: "plugin",
        accessMode: surface.kind === "settings" ? "permission-gated" : "private",
        zoneId: surface.zone,
        displayOrder: 0,
        templateId: surface.renderer.mode === "sandbox-frame" ? "admin.dashboard" : page.templateId,
        schema: surface.renderer.mode === "sandbox-frame"
          ? declarativePageContributionSchema.parse({ id: surface.id, title: surface.title, templateId: "admin.dashboard", access: "private", data: { rendererType: "sandbox-frame", sandbox: surface.renderer } })
          : page,
        requiredPermission: null,
        version: manifest.version,
      })];
    });
    const settingsTabs = manifest.contributes.settingsTabs.map((tab) => complete({
      pluginId: manifest.id,
      contributionId: tab.id,
      contributionType: "menu" as const,
      source: "plugin",
      accessMode: tab.requiredPermission ? "permission-gated" as const : "private" as const,
      zoneId: "settings.tabs",
      displayOrder: tab.displayOrder,
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
    const settingsPanels = manifest.contributes.settingsPanels.map((panel) => complete({
      pluginId: manifest.id,
      contributionId: panel.id,
      contributionType: "page" as const,
      source: "plugin",
      accessMode: panel.requiredPermission ? "permission-gated" as const : "private" as const,
      zoneId: `settings.panel.${panel.tabId}`,
      displayOrder: 0,
      templateId: panel.templateId,
      schema: declarativePageContributionSchema.parse({ ...panel.schema, dataSources: panel.dataSources.length ? panel.dataSources : panel.schema.dataSources, actions: panel.actions.length ? panel.actions : panel.schema.actions }),
      requiredPermission: panel.requiredPermission ?? null,
      version: manifest.version,
    }));
    const explicitTabIds = new Set(manifest.contributes.settingsTabs.map((tab) => tab.id));
    const explicitPanelIds = new Set(manifest.contributes.settingsPanels.map((panel) => panel.id));
    const settingsSurfaceTabs = manifest.contributes.surfaces.filter((surface) => surface.kind === "settings").flatMap((surface, index) => {
      const page = declarativeSurfacePage(surface);
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
        complete({
          pluginId: manifest.id,
          contributionId: tab.id,
          contributionType: "menu" as const,
          source: "plugin",
          accessMode: "private" as const,
          zoneId: "settings.tabs",
          displayOrder: tab.displayOrder,
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
        }),
        complete({
          pluginId: manifest.id,
          contributionId: panel.id,
          contributionType: "page" as const,
          source: "plugin",
          accessMode: "private" as const,
          zoneId: `settings.panel.${tab.id}`,
          displayOrder: tab.displayOrder,
          templateId: panel.templateId,
          schema: page,
          requiredPermission: null,
          version: manifest.version,
        }),
      ];
    });
    return [...surfaces, ...settingsTabs, ...settingsPanels, ...settingsSurfaceTabs] as PluginUiContribution[];
  }

  async ensurePlatformSettingsContributions(workspaceId: string) {
    if (await this.internalSeedCurrent(workspaceId, "settings.seed", PLATFORM_SETTINGS_SEED_VERSION)) return;
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
    const obsoleteSettingsContributionIds = [
      "platform.settings.plugins",
      "platform.settings.plugins.panel",
      "platform.settings.workspaces",
      "platform.settings.workspaces.panel",
    ];
    const statements = obsoleteSettingsContributionIds.flatMap((contributionId) => [
      this.db.prepare("DELETE FROM workspace_ui_activations WHERE workspace_id = ? AND plugin_id = 'platform' AND contribution_id = ?").bind(workspaceId, contributionId),
      this.db.prepare("DELETE FROM plugin_ui_contributions WHERE plugin_id = 'platform' AND contribution_id = ?").bind(contributionId),
    ]);
    for (const item of platformSettingsTabs()) {
      statements.push(this.db.prepare(`INSERT INTO plugin_ui_contributions
        (id, plugin_id, contribution_id, contribution_type, source, access_mode, zone_id, label, icon, display_order, configurable_json, template_id, schema_json, required_permission, version, updated_at)
        VALUES (?, 'platform', ?, 'menu', 'platform', 'private', 'settings.tabs', ?, ?, ?, ?, 'admin.settings', ?, ?, '0.0.0', CURRENT_TIMESTAMP)
        ON CONFLICT(plugin_id, contribution_id, version) DO UPDATE SET
          label = excluded.label,
          icon = excluded.icon,
          display_order = excluded.display_order,
          configurable_json = excluded.configurable_json,
          schema_json = excluded.schema_json,
          required_permission = excluded.required_permission,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(`platform:${item.tab.id}:0.0.0`, item.tab.id, item.tab.label, item.tab.icon ?? null, item.tab.displayOrder, JSON.stringify(config(false, { canDelete: false, canMoveSection: false })), JSON.stringify(item.tab), item.tab.requiredPermission ?? null));
      statements.push(this.db.prepare(`INSERT INTO plugin_ui_contributions
        (id, plugin_id, contribution_id, contribution_type, source, access_mode, zone_id, label, display_order, configurable_json, template_id, schema_json, required_permission, version, updated_at)
        VALUES (?, 'platform', ?, 'page', 'platform', 'private', ?, ?, ?, ?, ?, ?, ?, '0.0.0', CURRENT_TIMESTAMP)
        ON CONFLICT(plugin_id, contribution_id, version) DO UPDATE SET schema_json = excluded.schema_json, template_id = excluded.template_id, updated_at = CURRENT_TIMESTAMP`)
        .bind(`platform:${item.panel.id}:0.0.0`, item.panel.id, `settings.panel.${item.tab.id}`, item.panel.schema.title, item.tab.displayOrder, JSON.stringify(config(false, { canHide: false, canRename: false, canMoveSection: false, canChangeIcon: false })), item.panel.templateId, JSON.stringify(item.panel), item.panel.requiredPermission ?? null));
      statements.push(this.db.prepare(`INSERT INTO workspace_ui_activations
        (workspace_id, plugin_id, contribution_id, enabled, zone_override, order_index, configuration_json)
        VALUES (?, 'platform', ?, 1, 'settings.tabs', ?, NULL)
        ON CONFLICT(workspace_id, plugin_id, contribution_id) DO UPDATE SET
          enabled = excluded.enabled,
          zone_override = excluded.zone_override,
          order_index = excluded.order_index,
          configuration_json = excluded.configuration_json`)
        .bind(workspaceId, item.tab.id, item.tab.displayOrder));
      statements.push(this.db.prepare(`INSERT INTO workspace_ui_activations
        (workspace_id, plugin_id, contribution_id, enabled, zone_override, order_index, configuration_json)
        VALUES (?, 'platform', ?, 1, ?, ?, NULL)
        ON CONFLICT(workspace_id, plugin_id, contribution_id) DO UPDATE SET
          enabled = excluded.enabled,
          zone_override = excluded.zone_override,
          order_index = excluded.order_index,
          configuration_json = excluded.configuration_json`)
        .bind(workspaceId, item.panel.id, `settings.panel.${item.tab.id}`, item.tab.displayOrder));
    }
    statements.push(this.internalSeedStatement(workspaceId, "settings.seed", PLATFORM_SETTINGS_SEED_VERSION));
    await this.db.batch(statements);
  }

  private platformShellPages(): Array<{
    contributionId: string;
    label: string;
    icon: string;
    path: string;
    section: NavigationSection;
    order: number;
    requiredPermission: string | null;
    componentId: string;
    configurable: UiConfigurable;
    visibleInNavigation: boolean;
  }> {
    return [
      { contributionId: "platform.home", label: "Home", icon: "home", path: "/", section: "user", order: 10, requiredPermission: "workspace.read", componentId: "platform.home", configurable: config(false, { canDelete: false }), visibleInNavigation: true },
    ];
  }

  private platformShellPageSchema(page: ReturnType<CoreRepository["platformShellPages"]>[number]) {
    return declarativePageContributionSchema.parse({
      id: page.contributionId,
      title: page.label,
      templateId: "admin.dashboard",
      access: "permission-gated",
      slots: [{ id: `${page.contributionId}.header`, slot: "header", blocks: [{ type: "heading", text: page.label, level: "h2" }] }],
      data: {},
    });
  }

  async ensurePlatformShellContributions(workspaceId: string) {
    await this.db.batch([
      ...["platform.account", "platform.settings", "platform.workspaces", "platform.approvals"].flatMap((contributionId) => [
        this.db.prepare("DELETE FROM workspace_ui_activations WHERE workspace_id = ? AND plugin_id = 'platform' AND contribution_id = ?").bind(workspaceId, contributionId),
        this.db.prepare("DELETE FROM plugin_ui_contributions WHERE plugin_id = 'platform' AND contribution_id = ?").bind(contributionId),
      ]),
    ]);
    if (await this.internalSeedCurrent(workspaceId, "shell.seed", PLATFORM_SHELL_SEED_VERSION)) return;
    await this.ensurePlatformSettingsContributions(workspaceId);
    const statements = this.platformShellPages().flatMap((page) => [
      this.db.prepare(`INSERT INTO plugin_ui_contributions
        (id, plugin_id, contribution_id, contribution_type, source, access_mode, zone_id, default_path, label, icon, navigation_section, display_order, renderer_mode, component_id, configurable_json, template_id, schema_json, required_permission, version, updated_at)
        VALUES (?, 'platform', ?, 'page', 'platform', 'permission-gated', 'workspace.main', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0.0.0', CURRENT_TIMESTAMP)
        ON CONFLICT(plugin_id, contribution_id, version) DO UPDATE SET
          source = excluded.source,
          default_path = excluded.default_path,
          label = excluded.label,
          icon = excluded.icon,
          navigation_section = excluded.navigation_section,
          display_order = excluded.display_order,
          renderer_mode = excluded.renderer_mode,
          component_id = excluded.component_id,
          configurable_json = excluded.configurable_json,
          schema_json = excluded.schema_json,
          required_permission = excluded.required_permission,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(
          `platform:${page.contributionId}:0.0.0`,
          page.contributionId,
          page.path,
          page.label,
          page.icon,
          page.section,
          page.order,
          page.contributionId === "platform.account" ? "declarative" : "native",
          page.contributionId === "platform.account" ? null : page.componentId,
          JSON.stringify(page.configurable),
          JSON.stringify(this.platformShellPageSchema(page)),
          page.requiredPermission,
        ),
      this.db.prepare(`INSERT OR IGNORE INTO workspace_ui_activations
        (workspace_id, plugin_id, contribution_id, enabled, visible_in_navigation, zone_override, order_index)
        VALUES (?, 'platform', ?, 1, ?, 'workspace.main', ?)
        ON CONFLICT(workspace_id, plugin_id, contribution_id) DO UPDATE SET enabled = excluded.enabled, visible_in_navigation = excluded.visible_in_navigation, zone_override = excluded.zone_override, order_index = excluded.order_index`)
        .bind(workspaceId, page.contributionId, page.visibleInNavigation ? 1 : 0, page.order),
    ]);
    statements.push(this.internalSeedStatement(workspaceId, "shell.seed", PLATFORM_SHELL_SEED_VERSION));
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
        (id, plugin_id, contribution_id, contribution_type, source, access_mode, zone_id, label, display_order, renderer_mode, configurable_json, template_id, schema_json, required_permission, version, updated_at)
        VALUES (?, ?, ?, ?, 'plugin', ?, ?, ?, 0, 'declarative', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(plugin_id, contribution_id, version) DO UPDATE SET
          contribution_type = excluded.contribution_type,
          source = excluded.source,
          access_mode = excluded.access_mode,
          zone_id = excluded.zone_id,
          label = excluded.label,
          template_id = excluded.template_id,
          schema_json = excluded.schema_json,
          required_permission = excluded.required_permission,
          updated_at = CURRENT_TIMESTAMP`)
        .bind(`${manifest.id}:${contribution.contributionId}:${manifest.version}`, manifest.id, contribution.contributionId, contribution.contributionType, contribution.accessMode, contribution.zoneId, contribution.schema.title, JSON.stringify(config(false)), contribution.templateId, JSON.stringify(contribution.schema), contribution.requiredPermission, contribution.version)),
    ];
    if (packageData) {
      statements.push(this.db.prepare("INSERT OR REPLACE INTO plugin_packages (id, plugin_id, version, object_key, sha256, size_bytes, format) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(`${manifest.id}@${manifest.version}:${packageData.sha256}`, manifest.id, manifest.version, packageData.objectKey, packageData.sha256, packageData.sizeBytes, packageData.format));
    }
    await this.db.batch(statements);
  }

  async seedCatalogPlugin(plugin: CatalogPlugin, release?: CatalogRelease) {
    await this.db.prepare(`INSERT INTO plugin_catalog (plugin_id, name, version, manifest_json, category, demo_available, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(plugin_id) DO UPDATE SET name = excluded.name, version = excluded.version, manifest_json = excluded.manifest_json, category = excluded.category, demo_available = excluded.demo_available, source = excluded.source, updated_at = CURRENT_TIMESTAMP`)
      .bind(plugin.manifest.id, plugin.manifest.name, plugin.manifest.version, JSON.stringify(plugin.manifest), plugin.category, plugin.demoAvailable ? 1 : 0, plugin.source)
      .run();
    if (release) {
      await this.db.prepare(`INSERT INTO plugin_catalog_releases (id, plugin_id, version, manifest_json, package_object_key, sha256, size_bytes, format, worker_isolation, ui_mode, status, source, published_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(plugin_id, version, sha256) DO UPDATE SET manifest_json = excluded.manifest_json, package_object_key = excluded.package_object_key, size_bytes = excluded.size_bytes, format = excluded.format, worker_isolation = excluded.worker_isolation, ui_mode = excluded.ui_mode, status = excluded.status, source = excluded.source, published_at = excluded.published_at, updated_at = CURRENT_TIMESTAMP`)
        .bind(release.id, release.pluginId, release.version, JSON.stringify(release.manifest), release.packageObjectKey, release.sha256, release.sizeBytes, release.format, release.workerIsolation, release.uiMode, release.status, release.source)
        .run();
    }
  }

  async createPublicPolicy(workspaceId: string, input: { name: string; access: PublicContributionAccess; authenticationMode: "anonymous" | "customer" | "verified"; allowedOperations?: string[]; enabled?: boolean }) {
    const id = crypto.randomUUID();
    await this.db.prepare("INSERT INTO public_access_policies (id, workspace_id, name, access, authentication_mode, rules_json, allowed_operations_json, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, workspaceId, input.name, input.access, input.authenticationMode, null, JSON.stringify(input.allowedOperations ?? []), input.enabled === false ? 0 : 1)
      .run();
    return id;
  }

  async createPublication(publication: WorkspacePublication) {
    const route = routeMetadata(publication.routePattern ?? publication.publicPath);
    await this.db.prepare(`INSERT INTO workspace_publications (id, workspace_id, plugin_id, contribution_kind, publication_type, contribution_id, public_path, route_pattern, route_kind, route_priority, parameter_names_json, title, template_id, schema_json, status, policy_id, access, authentication_mode, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(publication.id, publication.workspaceId, publication.pluginId, publication.contributionKind, publication.publicationType ?? publication.contributionKind, publication.contributionId, publication.publicPath, route.pattern, route.kind, publication.routePriority ?? route.staticSegments, JSON.stringify(route.parameterNames), publication.title, publication.templateId ?? "public.page", JSON.stringify(publication.schema ?? {}), publication.status, publication.policyId, publication.access, publication.authenticationMode ?? "anonymous")
      .run();
  }

  async publish(publicationId: string) {
    await this.db.prepare("UPDATE workspace_publications SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(publicationId).run();
  }

  async deactivatePublication(workspaceId: string, publicationId: string) {
    await this.db.prepare("UPDATE workspace_publications SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?").bind(workspaceId, publicationId).run();
  }

  async publications(workspaceId: string): Promise<WorkspacePublicationRecord[]> {
    const rows = await this.db.prepare("SELECT id, workspace_id, plugin_id, contribution_kind, publication_type, contribution_id, public_path, route_pattern, route_kind, route_priority, parameter_names_json, title, template_id, schema_json, status, policy_id, access, authentication_mode, created_at, published_at, updated_at FROM workspace_publications WHERE workspace_id = ? ORDER BY updated_at DESC")
      .bind(workspaceId)
      .all<WorkspacePublicationRow>();
    return rows.results.map((row) => {
      const schemaResult = declarativePageContributionSchema.safeParse(safeJson<Record<string, unknown>>(row.schema_json, {}));
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
        parameterNames: safeJson<string[]>(row.parameter_names_json, []),
        title: row.title,
        templateId: row.template_id,
        ...(schemaResult.success ? { schema: schemaResult.data } : {}),
        status: row.status,
        policyId: row.policy_id,
        access: row.access,
        authenticationMode: row.authentication_mode,
        createdAt: row.created_at,
        publishedAt: row.published_at,
        updatedAt: row.updated_at,
      };
    });
  }

  async publicDeliveryForPath(path: string): Promise<PublicDelivery | undefined> {
    const rows = await this.db.prepare(`SELECT publications.id, publications.workspace_id, publications.plugin_id, publications.contribution_kind, publications.publication_type, publications.contribution_id, publications.public_path, publications.route_pattern, publications.route_kind, publications.route_priority, publications.parameter_names_json, publications.title, publications.template_id, publications.schema_json, publications.status, publications.policy_id, publications.access, publications.authentication_mode, policies.enabled AS policy_enabled, plugins.manifest_json
      FROM workspace_publications publications
      INNER JOIN installed_plugins plugins ON plugins.id = publications.plugin_id
      LEFT JOIN public_access_policies policies ON policies.id = publications.policy_id
      WHERE publications.status = 'published' AND publications.access = 'anonymous'
      ORDER BY publications.route_priority DESC, publications.updated_at DESC`)
      .all<PublicDeliveryRow>();
    for (const row of rows.results) {
      const routeParams = matchRoutePattern(row.route_pattern, path);
      if (!routeParams) continue;
      if (row.policy_id && row.policy_enabled !== 1) continue;
      const manifest = pluginManifestSchema.parse(JSON.parse(row.manifest_json));
      const contribution = allPublicContributions(manifest).find((item) => item.id === row.contribution_id);
      const storedPage = declarativePageContributionSchema.safeParse(safeJson<Record<string, unknown>>(row.schema_json, {}));
      const page = storedPage.success ? storedPage.data : declarativePageContributionSchema.parse({ id: row.contribution_id, title: row.title, templateId: row.template_id, access: row.access === "anonymous" ? "public-candidate" : "authenticated" });
      return { publication: { id: row.id, workspaceId: row.workspace_id, pluginId: row.plugin_id, contributionKind: row.contribution_kind, publicationType: row.publication_type, contributionId: row.contribution_id, publicPath: row.public_path, routePattern: row.route_pattern, routeKind: row.route_kind, routePriority: row.route_priority, parameterNames: safeJson<string[]>(row.parameter_names_json, []), title: row.title, templateId: row.template_id, schema: page, status: row.status, policyId: row.policy_id, access: row.access, authenticationMode: row.authentication_mode }, manifest, contribution, page, routeParams };
    }
    return undefined;
  }

  async publicDelivery(workspaceId: string, path: string): Promise<PublicDelivery | undefined> {
    const rows = await this.db.prepare(`SELECT publications.id, publications.workspace_id, publications.plugin_id, publications.contribution_kind, publications.publication_type, publications.contribution_id, publications.public_path, publications.route_pattern, publications.route_kind, publications.route_priority, publications.parameter_names_json, publications.title, publications.template_id, publications.schema_json, publications.status, publications.policy_id, publications.access, publications.authentication_mode, policies.enabled AS policy_enabled, plugins.manifest_json
      FROM workspace_publications publications
      INNER JOIN installed_plugins plugins ON plugins.id = publications.plugin_id
      LEFT JOIN public_access_policies policies ON policies.id = publications.policy_id
      WHERE publications.workspace_id = ? AND publications.status = 'published' AND publications.access = 'anonymous'
      ORDER BY publications.route_priority DESC, publications.updated_at DESC`)
      .bind(workspaceId)
      .all<PublicDeliveryRow>();
    for (const row of rows.results) {
      const routeParams = matchRoutePattern(row.route_pattern, path);
      if (!routeParams) continue;
      if (row.policy_id && row.policy_enabled !== 1) continue;
      const manifest = pluginManifestSchema.parse(JSON.parse(row.manifest_json));
      const contribution = allPublicContributions(manifest).find((item) => item.id === row.contribution_id);
      const storedPage = declarativePageContributionSchema.safeParse(safeJson<Record<string, unknown>>(row.schema_json, {}));
      const page = storedPage.success ? storedPage.data : declarativePageContributionSchema.parse({ id: row.contribution_id, title: row.title, templateId: row.template_id, access: row.access === "anonymous" ? "public-candidate" : "authenticated" });
      return { publication: { id: row.id, workspaceId: row.workspace_id, pluginId: row.plugin_id, contributionKind: row.contribution_kind, publicationType: row.publication_type, contributionId: row.contribution_id, publicPath: row.public_path, routePattern: row.route_pattern, routeKind: row.route_kind, routePriority: row.route_priority, parameterNames: safeJson<string[]>(row.parameter_names_json, []), title: row.title, templateId: row.template_id, schema: page, status: row.status, policyId: row.policy_id, access: row.access, authenticationMode: row.authentication_mode }, manifest, contribution, page, routeParams };
    }
    return undefined;
  }

  async publishWorkspaceContribution(input: { workspaceId: string; pluginId: string; contributionKind: PublicationKind; contributionId: string; publicPath?: string; title?: string; access?: PublicContributionAccess }) {
    const manifest = await this.installedById(input.pluginId);
    if (!manifest) return null;
    const publicContribution = allPublicContributions(manifest).find((item) => item.id === input.contributionId);
    const authenticationMode: "anonymous" | "customer" | "verified" = input.access === "anonymous" ? "anonymous" : "customer";
    const page = declarativePageContributionSchema.parse({
      id: input.contributionId,
      title: input.title ?? publicContribution?.title ?? input.contributionId,
      templateId: "public.contentPage",
      access: input.access === "authenticated" ? "authenticated" : "public-candidate",
    });
    const policyId = await this.createPublicPolicy(input.workspaceId, {
      name: `${input.contributionId} public policy`,
      access: input.access ?? "anonymous",
      authenticationMode,
      allowedOperations: [input.contributionId],
      enabled: true,
    });
    const publication = {
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      pluginId: input.pluginId,
      contributionKind: input.contributionKind,
      publicationType: input.contributionKind,
      contributionId: input.contributionId,
      publicPath: input.publicPath ?? `/${input.contributionId}`,
      title: input.title ?? publicContribution?.title ?? input.contributionId,
      templateId: "public.contentPage",
      schema: page,
      status: "published" as const,
      policyId,
      access: input.access ?? "anonymous",
      authenticationMode,
    };
    await this.createPublication(publication);
    await this.publish(publication.id);
    return publication;
  }

  async settingsTabs(workspaceId: string, permissions: Set<string> = new Set(workspacePermissions)) {
    await this.ensurePlatformSettingsContributions(workspaceId);
    const rows = await this.db.prepare(`SELECT contributions.plugin_id, contributions.contribution_id, contributions.schema_json, contributions.required_permission, activations.order_index, plugins.name
      FROM plugin_ui_contributions contributions
      INNER JOIN workspace_plugins workspace_plugins ON workspace_plugins.plugin_id = contributions.plugin_id AND workspace_plugins.workspace_id = ? AND workspace_plugins.active = 1
      INNER JOIN installed_plugins plugins ON plugins.id = contributions.plugin_id
      LEFT JOIN workspace_ui_activations activations ON activations.workspace_id = ? AND activations.plugin_id = contributions.plugin_id AND activations.contribution_id = contributions.contribution_id
      WHERE contributions.contribution_type = 'menu' AND contributions.zone_id = 'settings.tabs' AND COALESCE(activations.enabled, 1) = 1
      ORDER BY COALESCE(activations.order_index, contributions.display_order), contributions.contribution_id`)
      .bind(workspaceId, workspaceId)
      .all<{ plugin_id: string; contribution_id: string; schema_json: string; required_permission: string | null; order_index: number | null; name: string }>();
    return rows.results.flatMap((row) => {
      if (row.required_permission && !permissions.has(row.required_permission) && !permissions.has("workspace.admin")) return [];
      const tab = settingsTabContributionSchema.parse(JSON.parse(row.schema_json));
      return [{ ...tab, ownerName: row.name, orderIndex: row.order_index ?? tab.displayOrder }];
    });
  }

  async resolveSettingsTab(workspaceId: string, tabId: string, permissions: Set<string>): Promise<SettingsTabResolution | null> {
    const tabs = await this.settingsTabs(workspaceId, permissions);
    const tab = tabs.find((entry) => entry.id === tabId);
    if (!tab) return null;
    const row = await this.db.prepare(`SELECT contributions.schema_json, contributions.required_permission
      FROM plugin_ui_contributions contributions
      INNER JOIN workspace_plugins workspace_plugins ON workspace_plugins.plugin_id = contributions.plugin_id AND workspace_plugins.workspace_id = ? AND workspace_plugins.active = 1
      LEFT JOIN workspace_ui_activations activations ON activations.workspace_id = ? AND activations.plugin_id = contributions.plugin_id AND activations.contribution_id = contributions.contribution_id
      WHERE contributions.plugin_id = ? AND contributions.contribution_id = ? AND contributions.contribution_type = 'page' AND COALESCE(activations.enabled, 1) = 1
      LIMIT 1`)
      .bind(workspaceId, workspaceId, tab.pluginId, tab.panelContributionId)
      .first<{ schema_json: string; required_permission: string | null }>();
    if (!row || (row.required_permission && !permissions.has(row.required_permission) && !permissions.has("workspace.admin"))) return null;
    const panel = settingsPanelContributionSchema.parse(JSON.parse(row.schema_json));
    return { tab, panel };
  }

  async uiContributions(workspaceId: string, permissions: Set<string>) {
    const rows = await this.db.prepare(`SELECT contributions.plugin_id, contributions.contribution_id, contributions.contribution_type, contributions.source, contributions.access_mode, COALESCE(activations.zone_override, contributions.zone_id) AS zone_id, contributions.default_path, COALESCE(activations.visible_in_navigation, 1) AS visible_in_navigation, COALESCE(activations.label_override, contributions.label) AS label, COALESCE(activations.icon_override, contributions.icon) AS icon, COALESCE(activations.navigation_section_override, contributions.navigation_section) AS navigation_section, COALESCE(activations.order_index, contributions.display_order) AS display_order, contributions.renderer_mode, contributions.component_id, contributions.configurable_json, contributions.template_id, contributions.schema_json, contributions.required_permission, contributions.version
      FROM plugin_ui_contributions contributions
      INNER JOIN workspace_plugins workspace_plugins ON workspace_plugins.plugin_id = contributions.plugin_id AND workspace_plugins.workspace_id = ? AND workspace_plugins.active = 1
      LEFT JOIN workspace_ui_activations activations ON activations.workspace_id = ? AND activations.plugin_id = contributions.plugin_id AND activations.contribution_id = contributions.contribution_id
      WHERE COALESCE(activations.enabled, 1) = 1
      ORDER BY COALESCE(activations.order_index, contributions.display_order), contributions.contribution_id`)
      .bind(workspaceId, workspaceId)
      .all<{ plugin_id: string; contribution_id: string; contribution_type: PluginUiContribution["contributionType"]; source: UiSource; access_mode: AccessMode; zone_id: string | null; default_path: string | null; visible_in_navigation: number; label: string | null; icon: string | null; navigation_section: NavigationSection | null; display_order: number; renderer_mode: UiRendererMode; component_id: string | null; configurable_json: string; template_id: string; schema_json: string; required_permission: string | null; version: string }>();
    return rows.results.flatMap((row) => {
      if (row.required_permission && !permissions.has(row.required_permission) && !permissions.has("workspace.admin")) return [];

      const schema = row.contribution_type === "menu"
        ? (() => {
            const tab = settingsTabContributionSchema.parse(JSON.parse(row.schema_json));
            return declarativePageContributionSchema.parse({
              id: tab.id,
              title: tab.label,
              templateId: "admin.settings",
              access: row.required_permission ? "permission-gated" : "private",
              data: { settingsTab: tab },
            });
          })()
        : row.contribution_type === "page" && row.zone_id?.startsWith("settings.panel.")
          ? settingsPanelContributionSchema.parse(JSON.parse(row.schema_json)).schema
          : declarativePageContributionSchema.parse(JSON.parse(row.schema_json));
      return [{
        pluginId: row.plugin_id,
        contributionId: row.contribution_id,
        contributionType: row.contribution_type,
        source: row.source,
        accessMode: row.access_mode,
        zoneId: row.zone_id,
        defaultPath: row.default_path,
        visibleInNavigation: row.visible_in_navigation === 1,
        label: row.label,
        icon: row.icon,
        navigationSection: row.navigation_section,
        displayOrder: row.display_order,
        rendererMode: row.renderer_mode,
        componentId: row.component_id,
        configurable: safeJson<UiConfigurable>(row.configurable_json, config(false)),
        templateId: row.template_id,
        schema,
        requiredPermission: row.required_permission,
        version: row.version,
      }];
    });
  }

  async workspaceUiSurfaces(workspaceId: string) {
    const permissions = new Set(workspacePermissions);
    return (await this.uiContributions(workspaceId, permissions)).filter((item) => item.contributionType === "surface" || item.contributionType === "slot").map((item) => {
      const schema = item.schema as DeclarativePageContribution & { data?: { sandbox?: { entry?: string } } };
      return { id: item.contributionId, title: item.schema.title, zone: item.zoneId ?? "workspace.main", kind: item.contributionType === "surface" ? "page" : "panel", renderer: item.rendererMode === "sandbox-frame" ? { mode: "sandbox-frame" as const, entry: schema.data?.sandbox?.entry ?? "" } : { mode: "declarative" as const, schema: item.schema } };
    });
  }

  async resolveSandboxSurface(workspaceId: string, surfaceId: string): Promise<SandboxSurfaceAsset | null> {
    const row = await this.db.prepare(`SELECT contributions.plugin_id, packages.object_key, contributions.schema_json
      FROM plugin_ui_contributions contributions
      INNER JOIN workspace_plugins workspace_plugins ON workspace_plugins.workspace_id = ? AND workspace_plugins.plugin_id = contributions.plugin_id AND workspace_plugins.active = 1
      INNER JOIN installed_plugins plugins ON plugins.id = contributions.plugin_id
      INNER JOIN plugin_packages packages ON packages.plugin_id = plugins.id AND packages.version = contributions.version
      WHERE contributions.contribution_id = ? AND contributions.renderer_mode = 'sandbox-frame' LIMIT 1`)
      .bind(workspaceId, surfaceId)
      .first<{ plugin_id: string; object_key: string; schema_json: string }>();
    if (!row) return null;
    const schema = declarativePageContributionSchema.parse(JSON.parse(row.schema_json));
    const sandbox = schema.data.sandbox as { entry?: string } | undefined;
    return sandbox?.entry ? { pluginId: row.plugin_id, surfaceId, objectKey: row.object_key, entry: sandbox.entry } : null;
  }

  async runtimeContribution(workspaceId: string, contributionId: string, permissions: Set<string>) {
    const contributions = await this.uiContributions(workspaceId, permissions);
    const contribution = contributions.find((item) => item.contributionId === contributionId);
    return contribution ? { workspaceId, pluginId: contribution.pluginId, contributionId, page: contribution.schema, requiredPermission: contribution.requiredPermission } satisfies RuntimeContributionResolution : null;
  }

  async runtimePage(workspaceId: string, contributionId: string) {
    return this.privateRuntimeContribution(workspaceId, contributionId);
  }

  async privateRuntimeContribution(workspaceId: string, contributionId: string) {
    const [contributions, interfaces] = await Promise.all([
      this.uiContributions(workspaceId, new Set(workspacePermissions)),
      this.interfaceContributions(workspaceId),
    ]);
    const resolved = contributions.find((item) => item.contributionId === contributionId);
    const contribution = interfaces.find((item) => item.id === contributionId);
    if (!resolved || !contribution) return null;
    const row = await this.db.prepare(`SELECT schema_json, required_permission
      FROM plugin_ui_contributions
      WHERE plugin_id = ? AND contribution_id = ? AND contribution_type = 'page'
      LIMIT 1`)
      .bind(resolved.pluginId, contributionId)
      .first<{ schema_json: string; required_permission: string | null }>();
    if (!row) return null;
    const panel = settingsPanelContributionSchema.parse(JSON.parse(row.schema_json));
    return { workspaceId, pluginId: resolved.pluginId, contributionId, contribution: { ...contribution, ...(resolved.requiredPermission ? { requiredPermission: resolved.requiredPermission } : {}) }, page: resolved.schema, requiredPermission: resolved.requiredPermission, panel };
  }

  async publicRuntimeContribution(workspaceId: string, contributionId: string) {
    const publication = (await this.publications(workspaceId)).find((item) => item.contributionId === contributionId && item.status === "published" && item.access === "anonymous");
    if (!publication) return null;
    const manifest = await this.installedById(publication.pluginId);
    if (!manifest) return null;
    const contribution = allPublicContributions(manifest).find((item) => item.id === contributionId);
    const publicSurface = publicSurfaceId(contribution);
    const page = publication.schema ?? declarativePageContributionSchema.parse({ id: publication.contributionId, title: publication.title, templateId: publication.templateId ?? "public.contentPage", access: publication.access === "anonymous" ? "public-candidate" : "authenticated", ...(publicSurface ? { data: { publicSurfaceId: publicSurface } } : {}) });
    const policyRow = publication.policyId ? await this.db.prepare("SELECT id, access, authentication_mode, allowed_operations_json, enabled FROM public_access_policies WHERE id = ? LIMIT 1").bind(publication.policyId).first<{ id: string; access: PublicContributionAccess; authentication_mode: "anonymous" | "customer" | "verified"; allowed_operations_json: string; enabled: number }>() : null;
    return { workspaceId, pluginId: publication.pluginId, contributionId, publication, contribution, page, policy: policyRow ? { id: policyRow.id, access: policyRow.access, authenticationMode: policyRow.authentication_mode, allowedOperations: safeJson<string[]>(policyRow.allowed_operations_json, []), enabled: policyRow.enabled === 1 } : undefined };
  }

  async updatePluginUiContribution(workspaceId: string, contributionId: string, changes: { enabled?: boolean; visibleInNavigation?: boolean; label?: string; icon?: string; section?: NavigationSection; displayOrder?: number }, actorId?: string) {
    const updated = await this.updateInterfaceContribution(workspaceId, contributionId, changes);
    if (updated) await this.audit(workspaceId, "plugin.ui.contribution.update", { contributionId, changes }, actorId);
    return updated;
  }

  async navigation(workspaceId: string, permissions: Set<string>) {
    await this.ensurePlatformShellContributions(workspaceId);
    const contributions = await this.uiContributions(workspaceId, permissions);
    return contributions
      .filter((item) => (item.contributionType === "page" || item.contributionType === "menu") && Boolean(item.defaultPath) && Boolean(item.navigationSection) && item.visibleInNavigation !== false)
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((item) => ({ id: item.contributionId, pluginId: item.pluginId, path: item.defaultPath!, label: item.label ?? item.schema.title, ...(item.icon ? { icon: item.icon } : {}), section: item.navigationSection!, displayOrder: item.displayOrder, rendererMode: item.rendererMode, ...(item.componentId ? { componentId: item.componentId } : {}), source: item.source, ...(item.requiredPermission ? { requiredPermission: item.requiredPermission } : {}), visibleInNavigation: item.visibleInNavigation }));
  }

  async interfaceContributions(workspaceId: string): Promise<InterfaceContributionRow[]> {
    const contributions = await this.uiContributions(workspaceId, new Set(workspacePermissions));
    return contributions.filter((item) => item.contributionType === "page" || item.contributionType === "menu").map((item) => ({ id: item.contributionId, pluginId: item.pluginId, path: item.defaultPath ?? "", label: item.label ?? item.schema.title, ...(item.icon ? { icon: item.icon } : {}), section: item.navigationSection ?? "administration", displayOrder: item.displayOrder, rendererMode: item.rendererMode, ...(item.componentId ? { componentId: item.componentId } : {}), source: item.source, ...(item.requiredPermission ? { requiredPermission: item.requiredPermission } : {}), kind: item.contributionType, active: true, visibleInNavigation: item.visibleInNavigation !== false, status: "active", configurable: item.configurable }));
  }

  async createManualPage(workspaceId: string, input: ManualPageInput) {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    const path = normalizeShellPath(`/${slug}`);
    if (!slug || reservedShellPaths.has(path)) throw new Error("Reserved route path.");
    const contributionId = manualContributionId(workspaceId, slug);
    const schema = declarativePageContributionSchema.parse({ id: contributionId, title: input.title.trim(), templateId: "admin.dashboard", access: "private", slots: [{ id: `${contributionId}.body`, slot: "body", blocks: input.blocks ?? [{ type: "heading", text: input.title.trim(), level: "h2" }] }] });
    await this.db.batch([
      this.db.prepare(`INSERT INTO plugin_ui_contributions
        (id, plugin_id, contribution_id, contribution_type, source, access_mode, zone_id, default_path, label, icon, navigation_section, display_order, renderer_mode, configurable_json, template_id, schema_json, required_permission, version, updated_at)
        VALUES (?, 'platform', ?, 'page', 'manual', 'private', 'workspace.main', ?, ?, ?, ?, ?, 'declarative', ?, 'admin.dashboard', ?, NULL, 'manual', CURRENT_TIMESTAMP)`)
        .bind(`platform:${contributionId}:manual`, contributionId, path, input.label?.trim() || input.title.trim(), input.icon?.trim() || null, input.navigationSection ?? "administration", input.displayOrder ?? 500, JSON.stringify(config(true)), JSON.stringify(schema)),
      this.db.prepare(`INSERT INTO workspace_ui_activations (workspace_id, plugin_id, contribution_id, enabled, visible_in_navigation, zone_override, order_index, configuration_json)
        VALUES (?, 'platform', ?, ?, ?, 'workspace.main', ?, '{}')`)
        .bind(workspaceId, contributionId, input.enabled === false ? 0 : 1, input.visibleInNavigation === false ? 0 : 1, input.displayOrder ?? 500),
    ]);
    return contributionId;
  }

  async updateInterfaceContribution(workspaceId: string, contributionId: string, changes: { enabled?: boolean; visibleInNavigation?: boolean; label?: string; icon?: string; section?: NavigationSection; displayOrder?: number }) {
    if (protectedPlatformPages.has(contributionId) && changes.enabled === false) throw new Error("Protected platform pages cannot be disabled.");
    const current = (await this.interfaceContributions(workspaceId)).find((item) => item.id === contributionId);
    if (!current) return null;
    await this.db.prepare(`INSERT INTO workspace_ui_activations
      (workspace_id, plugin_id, contribution_id, enabled, visible_in_navigation, label_override, icon_override, navigation_section_override, order_index, configuration_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')
      ON CONFLICT(workspace_id, plugin_id, contribution_id) DO UPDATE SET enabled = excluded.enabled, visible_in_navigation = excluded.visible_in_navigation, label_override = excluded.label_override, icon_override = excluded.icon_override, navigation_section_override = excluded.navigation_section_override, order_index = excluded.order_index`)
      .bind(workspaceId, current.pluginId, contributionId, changes.enabled === false ? 0 : 1, changes.visibleInNavigation === false ? 0 : 1, changes.label ?? current.label, changes.icon ?? current.icon ?? null, changes.section ?? current.section, changes.displayOrder ?? current.displayOrder)
      .run();
    return (await this.interfaceContributions(workspaceId)).find((item) => item.id === contributionId) ?? null;
  }

  async deleteInterfaceContribution(workspaceId: string, contributionId: string) {
    if (protectedPlatformPages.has(contributionId)) return false;
    const current = (await this.interfaceContributions(workspaceId)).find((item) => item.id === contributionId);
    if (!current?.configurable.canDelete) return false;
    await this.db.batch([
      this.db.prepare("DELETE FROM workspace_ui_activations WHERE workspace_id = ? AND plugin_id = ? AND contribution_id = ?").bind(workspaceId, current.pluginId, contributionId),
      this.db.prepare("DELETE FROM plugin_ui_contributions WHERE plugin_id = ? AND contribution_id = ?").bind(current.pluginId, contributionId),
    ]);
    return true;
  }

  async getSettings(workspaceId: string, scope: SettingScope) {
    const rows = await this.db.prepare("SELECT key, value_json FROM workspace_settings WHERE workspace_id = ? AND scope = ? ORDER BY key").bind(workspaceId, scope).all<{ key: string; value_json: string }>();
    return Object.fromEntries(rows.results.map((row) => [row.key, JSON.parse(row.value_json)]));
  }

  async saveSetting(workspaceId: string, scope: SettingScope, key: string, value: unknown) {
    await this.db.prepare("INSERT INTO workspace_settings (workspace_id, scope, key, value_json, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, scope, key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP").bind(workspaceId, scope, key, JSON.stringify(value)).run();
  }

  async setSetting(workspaceId: string, scope: SettingScope, key: string, value: unknown) {
    return this.saveSetting(workspaceId, scope, key, value);
  }

  async getLayout(workspaceId: string): Promise<WorkspaceLayout | undefined> {
    const settings = await this.getSettings(workspaceId, "platform");
    return settings.layout as WorkspaceLayout | undefined;
  }

  async saveLayout(workspaceId: string, layout: WorkspaceLayout) {
    await this.saveSetting(workspaceId, "platform", "layout", layout);
    return layout;
  }

  async generalSettings(workspaceId: string) {
    const settings = await this.getSettings(workspaceId, "platform");
    const workspace = await this.db.prepare("SELECT name FROM workspaces WHERE id = ? LIMIT 1").bind(workspaceId).first<{ name: string }>();
    return { workspaceName: workspace?.name ?? "", language: settings.language ?? "ro-RO", timezone: settings.timezone ?? "Europe/Bucharest", defaultCurrency: settings.defaultCurrency ?? "RON", brandingName: settings.brandingName ?? workspace?.name ?? "", brandColor: settings.brandColor ?? "#2563eb", contactEmailPublic: settings.contactEmailPublic ?? "", contactPhonePublic: settings.contactPhonePublic ?? "" };
  }

  async saveGeneralSettings(workspaceId: string, input: Record<string, unknown>, actorId?: string) {
    if (typeof input.workspaceName === "string" && input.workspaceName.trim()) await this.db.prepare("UPDATE workspaces SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(input.workspaceName.trim(), workspaceId).run();
    for (const key of ["language", "timezone", "defaultCurrency", "brandingName", "brandColor", "contactEmailPublic", "contactPhonePublic"] as const) {
      if (key in input) await this.saveSetting(workspaceId, "platform", key, input[key]);
    }
    await this.audit(workspaceId, "settings.general.update", { keys: Object.keys(input) }, actorId);
    return this.generalSettings(workspaceId);
  }
}

export function createCoreRepository(env: CoreEnv) {
  return new CoreRepository(env.CORE_DB, env);
}
