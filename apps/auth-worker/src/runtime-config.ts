import { authPolicySchema, authPolicyWriteSchema, authPublicLoginConfigSchema, authMethodWriteSchema, authUiContributionSchema, authUiContributionWriteSchema, type AuthProfilePasskey, type AuthProfileSession, type AuthPublicLoginConfig } from "@v2/auth-contracts";

type AuthMethodRow = {
  id: string;
  workspace_id: string | null;
  type: "password" | "passkey" | "social";
  provider_id: string | null;
  title: string;
  status: "draft" | "enabled" | "disabled";
  public_visible: number;
  display_order: number;
  configuration_ref: string | null;
  created_at: string;
  updated_at: string;
};

type AuthUiContributionRow = {
  id: string;
  workspace_id: string | null;
  contribution_id: string;
  slot: "login.header" | "login.branding" | "login.beforeMethods" | "login.password" | "login.socialMethods" | "login.passkey" | "login.afterMethods" | "login.footer" | "login.legal";
  template_id: string;
  schema_json: string;
  renderer_json: string;
  status: "draft" | "published" | "unpublished";
  display_order: number;
  created_at: string;
  updated_at: string;
};
type AuthPolicyRow = {
  id: string;
  workspace_id: string | null;
  registration_mode: "disabled" | "open" | "invitation-only" | "admin-created";
  require_email_verification: number;
  allow_passkey_registration: number;
  allow_passkey_signin: number;
  created_at: string;
  updated_at: string;
};
type ImpersonationSessionRow = {
  id: string;
  actor_user_id: string;
  actor_session_id: string;
  subject_user_id: string;
  workspace_id: string;
  reason: string;
  status: "pending" | "active" | "revoked" | "expired" | "ended";
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  ended_at: string | null;
  root_session_id: string | null;
};
type AuthUserAdminRow = {
  id: string;
  name: string;
  email: string;
  email_verified: number;
  two_factor_enabled: number;
  language: string | null;
  location: string | null;
  timezone: string | null;
  created_at: number | string;
  updated_at: number | string;
  passkey_count: number;
  active_session_count: number;
};
type AuthSessionRow = {
  id: string;
  user_id: string;
  expires_at: number | string;
  ip_address: string | null;
  user_agent: string | null;
  impersonated_by: string | null;
  created_at: number | string;
  updated_at: number | string;
};
type AuthPasskeyRow = {
  id: string;
  name: string | null;
  device_type: string;
  backed_up: number;
  created_at: number | string | null;
};

export type RuntimeAuthProviderState = {
  github: boolean;
};

export class AuthRuntimeRepository {
  constructor(private readonly db: D1Database, private readonly platformAdminEmails: Set<string> = new Set()) {}

  private scoped(workspaceId?: string | null) {
    return workspaceId ?? null;
  }

  async ensureBootstrap(providerState: RuntimeAuthProviderState) {
    await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO auth_methods
        (id, workspace_id, type, provider_id, title, status, public_visible, display_order, configuration_ref)
        VALUES ('password', NULL, 'password', NULL, 'Email and password', 'enabled', 1, 10, NULL)`),
      this.db.prepare(`INSERT OR IGNORE INTO auth_methods
        (id, workspace_id, type, provider_id, title, status, public_visible, display_order, configuration_ref)
        VALUES ('passkey', NULL, 'passkey', NULL, 'Passkey', 'draft', 0, 30, NULL)`),
      ...(providerState.github ? [this.db.prepare(`INSERT OR IGNORE INTO auth_methods
        (id, workspace_id, type, provider_id, title, status, public_visible, display_order, configuration_ref)
        VALUES ('social.github', NULL, 'social', 'github', 'GitHub', 'draft', 0, 20, 'env:GITHUB_CLIENT_ID')`)] : []),
      this.db.prepare(`INSERT OR IGNORE INTO auth_policies
        (id, workspace_id, registration_mode, require_email_verification, allow_passkey_registration, allow_passkey_signin)
        VALUES ('global', NULL, 'disabled', 0, 0, 0)`),
      this.db.prepare(`INSERT OR IGNORE INTO auth_ui_contributions
        (id, workspace_id, contribution_id, slot, template_id, schema_json, renderer_json, status, display_order)
        VALUES ('login.header.default', NULL, 'login.header.default', 'login.header', 'auth.login', ?, ?, 'published', 0)`)
        .bind(JSON.stringify({ id: "login.header.default", slot: "login.header", displayOrder: 0, blocks: [{ type: "text", text: "Sign in to continue", tone: "accent" }, { type: "text", text: "Available methods are loaded from Auth runtime configuration.", tone: "muted" }] }), JSON.stringify({ body: [{ type: "text", text: "Sign in to continue", tone: "accent" }, { type: "text", text: "Available methods are loaded from Auth runtime configuration.", tone: "muted" }] })),
      this.db.prepare(`INSERT OR IGNORE INTO auth_ui_contributions
        (id, workspace_id, contribution_id, slot, template_id, schema_json, renderer_json, status, display_order)
        VALUES ('login.footer.default', NULL, 'login.footer.default', 'login.footer', 'auth.login', ?, ?, 'published', 100)`)
        .bind(JSON.stringify({ id: "login.footer.default", slot: "login.footer", displayOrder: 100, blocks: [{ type: "text", text: "Auth is handled by the dedicated Auth service.", tone: "muted" }] }), JSON.stringify({ body: [{ type: "text", text: "Auth is handled by the dedicated Auth service.", tone: "muted" }] })),
    ]);
  }

  async publicPolicy(workspaceId?: string | null) {
    const workspace = this.scoped(workspaceId);
    const row = await this.db.prepare(`SELECT id, workspace_id, registration_mode, require_email_verification, allow_passkey_registration, allow_passkey_signin, created_at, updated_at
      FROM auth_policies
      WHERE workspace_id IS NULL OR workspace_id = ?
      ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END
      LIMIT 1`)
      .bind(workspace, workspace)
      .first<AuthPolicyRow>();
    return authPolicySchema.parse(row ? {
      id: row.id,
      workspaceId: row.workspace_id,
      registrationMode: row.registration_mode,
      requireEmailVerification: row.require_email_verification === 1,
      allowPasskeyRegistration: row.allow_passkey_registration === 1,
      allowPasskeySignin: row.allow_passkey_signin === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : { id: "global", workspaceId: null, registrationMode: "disabled", requireEmailVerification: false, allowPasskeyRegistration: false, allowPasskeySignin: false });
  }

  async publicLoginConfig(workspaceId?: string | null, providerState: RuntimeAuthProviderState = { github: false }): Promise<AuthPublicLoginConfig> {
    await this.ensureBootstrap(providerState);
    const workspace = this.scoped(workspaceId);
    const methodRows = await this.db.prepare(`SELECT id, workspace_id, type, provider_id, title, status, public_visible, display_order, configuration_ref, created_at, updated_at
      FROM auth_methods
      WHERE status = 'enabled' AND public_visible = 1 AND (workspace_id IS NULL OR workspace_id = ?)
      ORDER BY display_order, title`)
      .bind(workspace)
      .all<AuthMethodRow>();
    const uiRows = await this.db.prepare(`SELECT id, workspace_id, contribution_id, slot, template_id, schema_json, renderer_json, status, display_order, created_at, updated_at
      FROM auth_ui_contributions
      WHERE status = 'published' AND (workspace_id IS NULL OR workspace_id = ?)
      ORDER BY display_order, slot`)
      .bind(workspace)
      .all<AuthUiContributionRow>();
    const policy = await this.publicPolicy(workspace);
    const methods = methodRows.results.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      type: row.type,
      providerId: row.provider_id,
      title: row.title,
      status: row.status,
      publicVisible: row.public_visible === 1,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    const uiContributions = uiRows.results.map((row) => {
      const renderer = JSON.parse(row.renderer_json) as { body?: unknown[] };
      const schema = JSON.parse(row.schema_json) as { id?: unknown; slot?: unknown };
      return authUiContributionSchema.parse({
        id: row.id,
        workspaceId: row.workspace_id,
        contributionId: row.contribution_id,
        slot: row.slot,
        templateId: row.template_id,
        schema: typeof schema.id === "string" && typeof schema.slot === "string" ? schema : { id: row.contribution_id, slot: row.slot, displayOrder: row.display_order, blocks: renderer.body ?? [] },
        renderer,
        status: row.status,
        displayOrder: row.display_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    });
    const publishedMethods = methods.filter((method) => method.type !== "passkey" || policy.allowPasskeySignin);
    return authPublicLoginConfigSchema.parse({
      workspaceId: workspace,
      methods: publishedMethods,
      uiContributions,
      features: {
        password: publishedMethods.some((method) => method.type === "password"),
        passkey: publishedMethods.some((method) => method.type === "passkey") && policy.allowPasskeySignin,
        social: publishedMethods.some((method) => method.type === "social"),
      },
      policy: {
        registrationMode: policy.registrationMode,
        requireEmailVerification: policy.requireEmailVerification,
        allowPasskeyRegistration: policy.allowPasskeyRegistration,
        allowPasskeySignin: policy.allowPasskeySignin,
      },
    });
  }

  async listMethods(workspaceId?: string | null, providerState: RuntimeAuthProviderState = { github: false }) {
    await this.ensureBootstrap(providerState);
    const workspace = this.scoped(workspaceId);
    const rows = await this.db.prepare(`SELECT id, workspace_id, type, provider_id, title, status, public_visible, display_order, configuration_ref, created_at, updated_at
      FROM auth_methods
      WHERE workspace_id IS NULL OR workspace_id = ?
      ORDER BY display_order, title`)
      .bind(workspace)
      .all<AuthMethodRow>();
    return rows.results.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      type: row.type,
      providerId: row.provider_id,
      title: row.title,
      status: row.status,
      publicVisible: row.public_visible === 1,
      displayOrder: row.display_order,
      configurationRef: row.configuration_ref,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async listUiContributions(workspaceId?: string | null) {
    const workspace = this.scoped(workspaceId);
    const rows = await this.db.prepare(`SELECT id, workspace_id, contribution_id, slot, template_id, schema_json, renderer_json, status, display_order, created_at, updated_at
      FROM auth_ui_contributions
      WHERE workspace_id IS NULL OR workspace_id = ?
      ORDER BY display_order, slot`)
      .bind(workspace)
      .all<AuthUiContributionRow>();
    return rows.results.map((row) => {
      const rawSchema = JSON.parse(row.schema_json) as Record<string, unknown>;
      const schema = typeof rawSchema.id === "string" && typeof rawSchema.slot === "string"
        ? rawSchema
        : { id: row.contribution_id, slot: row.slot, displayOrder: row.display_order, blocks: [] };
      return authUiContributionSchema.parse({
        id: row.id,
        workspaceId: row.workspace_id,
        contributionId: row.contribution_id,
        slot: row.slot,
        templateId: row.template_id,
        schema,
        renderer: JSON.parse(row.renderer_json),
        status: row.status,
        displayOrder: row.display_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    });
  }

  async securitySummary(workspaceId?: string | null, providerState: RuntimeAuthProviderState = { github: false }) {
    const [policy, methods, uiContributions] = await Promise.all([this.publicPolicy(workspaceId), this.listMethods(workspaceId, providerState), this.listUiContributions(workspaceId)]);
    return {
      policy,
      methods: methods.map((method) => ({ ...method, configurationRef: method.configurationRef ? "server-side" : null })),
      publishedLoginContributions: uiContributions.filter((item) => item.status === "published").length,
      serverSideAvailability: { password: true, passkey: true, twoFactor: true, github: providerState.github },
      emailDelivery: { verification: false, passwordReset: false, status: "unavailable" },
      bootstrapAdmin: true,
    };
  }

  async sessionsSummary() {
    const sessionCount = await this.db.prepare("SELECT COUNT(*) AS count FROM session WHERE expires_at > ?").bind(Date.now()).first<{ count: number }>().catch(() => ({ count: 0 }));
    const passkeyCount = await this.db.prepare("SELECT COUNT(*) AS count FROM passkey").first<{ count: number }>().catch(() => ({ count: 0 }));
    return { sessions: sessionCount?.count ?? 0, passkeys: passkeyCount?.count ?? 0 };
  }

  async listPasskeys(userId: string): Promise<AuthProfilePasskey[]> {
    const rows = await this.db.prepare(`SELECT id, name, device_type, backed_up, created_at
      FROM passkey
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC`)
      .bind(userId)
      .all<AuthPasskeyRow>();
    return rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      deviceType: row.device_type,
      backedUp: row.backed_up === 1,
      createdAt: row.created_at ?? "",
    }));
  }

  async listUsers() {
    const rows = await this.db.prepare(`SELECT users.id, users.name, users.email, users.email_verified, users.two_factor_enabled, users.created_at, users.updated_at,
        users.language,
        users.location,
        users.timezone,
        COUNT(DISTINCT passkeys.id) AS passkey_count,
        COUNT(DISTINCT sessions.id) AS active_session_count
      FROM user users
      LEFT JOIN passkey passkeys ON passkeys.user_id = users.id
      LEFT JOIN session sessions ON sessions.user_id = users.id AND sessions.expires_at > ?
      GROUP BY users.id, users.name, users.email, users.email_verified, users.two_factor_enabled, users.language, users.location, users.timezone, users.created_at, users.updated_at
      ORDER BY users.created_at DESC`)
      .bind(Date.now())
      .all<AuthUserAdminRow>();
    return rows.results.map((row) => ({ id: row.id, name: row.name, email: row.email, emailVerified: row.email_verified === 1, twoFactorEnabled: row.two_factor_enabled === 1, language: row.language, location: row.location, timezone: row.timezone, passkeys: row.passkey_count, sessions: row.active_session_count, createdAt: row.created_at, updatedAt: row.updated_at, isPlatformAdmin: this.platformAdminEmails.has(row.email.toLowerCase()) }));
  }

  async listSessions(userId: string, currentSessionId?: string | null): Promise<AuthProfileSession[]> {
    const rows = await this.db.prepare(`SELECT id, user_id, expires_at, ip_address, user_agent, impersonated_by, created_at, updated_at
      FROM session
      WHERE user_id = ? AND expires_at > ?
      ORDER BY created_at DESC, id DESC`)
      .bind(userId, Date.now())
      .all<AuthSessionRow>();
    return rows.results.map((row) => ({
      id: row.id,
      current: row.id === currentSessionId,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      impersonatedBy: row.impersonated_by,
    }));
  }

  async revokeSession(userId: string, sessionId: string, currentSessionId?: string | null) {
    const row = await this.db.prepare("SELECT id FROM session WHERE id = ? AND user_id = ? LIMIT 1").bind(sessionId, userId).first<{ id: string }>();
    if (!row) return { revoked: false, currentSessionRevoked: false };
    const currentSessionRevoked = row.id === currentSessionId;
    await this.db.prepare("DELETE FROM session WHERE id = ? AND user_id = ?").bind(sessionId, userId).run();
    return { revoked: true, currentSessionRevoked };
  }

  async revokeOtherSessions(userId: string, currentSessionId: string) {
    const response = await this.db.prepare("DELETE FROM session WHERE user_id = ? AND id != ?").bind(userId, currentSessionId).run();
    return { revokedCount: response.meta.changes ?? 0 };
  }

  async listImpersonationSessions(workspaceId?: string | null) {
    const rows = await this.db.prepare(`SELECT id, actor_user_id, actor_session_id, subject_user_id, workspace_id, reason, status, created_at, expires_at, revoked_at, ended_at, root_session_id
      FROM impersonation_sessions
      WHERE workspace_id = ? OR ? IS NULL
      ORDER BY created_at DESC`)
      .bind(workspaceId ?? null, workspaceId ?? null)
      .all<ImpersonationSessionRow>();
    return rows.results.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorSessionId: row.actor_session_id,
      subjectUserId: row.subject_user_id,
      workspaceId: row.workspace_id,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      endedAt: row.ended_at,
      rootSessionId: row.root_session_id,
    }));
  }

  async startImpersonation(input: { actorUserId: string; actorSessionId: string; subjectUserId: string; workspaceId: string; reason: string; sessionId: string; expiresAt: string }) {
    const id = crypto.randomUUID();
    await this.db.prepare(`INSERT INTO impersonation_sessions
      (id, actor_user_id, actor_session_id, subject_user_id, workspace_id, reason, status, created_at, expires_at, root_session_id)
      VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, ?, ?)`)
      .bind(id, input.actorUserId, input.actorSessionId, input.subjectUserId, input.workspaceId, input.reason, input.expiresAt, input.sessionId)
      .run();
    return { id, actorUserId: input.actorUserId, subjectUserId: input.subjectUserId, workspaceId: input.workspaceId, reason: input.reason, expiresAt: input.expiresAt, impersonatedSessionId: input.sessionId };
  }

  async activeImpersonationForSession(impersonatedSessionId: string) {
    const row = await this.db.prepare(`SELECT id, actor_user_id, actor_session_id, subject_user_id, workspace_id, reason, status, created_at, expires_at, revoked_at, ended_at, root_session_id
      FROM impersonation_sessions
      WHERE root_session_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1`)
      .bind(impersonatedSessionId)
      .first<ImpersonationSessionRow>();
    if (!row) return null;
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
      await this.db.prepare("UPDATE impersonation_sessions SET status = 'expired', ended_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
      return null;
    }
    return {
      id: row.id,
      actorUserId: row.actor_user_id,
      actorSessionId: row.actor_session_id,
      subjectUserId: row.subject_user_id,
      workspaceId: row.workspace_id,
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      impersonatedSessionId: row.root_session_id,
    };
  }

  async stopImpersonationForSession(impersonatedSessionId: string) {
    const row = await this.db.prepare(`SELECT impersonation.id, impersonation.actor_user_id, impersonation.actor_session_id, impersonation.subject_user_id,
        impersonation.workspace_id, impersonation.reason, impersonation.expires_at, actor.token AS actor_token
      FROM impersonation_sessions impersonation
      LEFT JOIN session actor ON actor.id = impersonation.actor_session_id
      WHERE impersonation.root_session_id = ? AND impersonation.status = 'active'
      ORDER BY impersonation.created_at DESC
      LIMIT 1`)
      .bind(impersonatedSessionId)
      .first<{ id: string; actor_user_id: string; actor_session_id: string; subject_user_id: string; workspace_id: string; reason: string; expires_at: string | null; actor_token: string | null }>();
    if (!row) return null;
    await this.db.batch([
      this.db.prepare("UPDATE impersonation_sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id),
      this.db.prepare("DELETE FROM session WHERE id = ?").bind(impersonatedSessionId),
    ]);
    return {
      impersonation: {
        id: row.id,
        actorUserId: row.actor_user_id,
        subjectUserId: row.subject_user_id,
        workspaceId: row.workspace_id,
        reason: row.reason,
        expiresAt: row.expires_at,
      },
      actorToken: row.actor_token,
    };
  }

  async upsertMethod(input: unknown) {
    const request = authMethodWriteSchema.parse(input);
    const id = request.type === "social" && request.providerId ? `social.${request.providerId}` : request.type;
    await this.db.prepare(`INSERT INTO auth_methods
      (id, workspace_id, type, provider_id, title, status, public_visible, display_order, configuration_ref, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        type = excluded.type,
        provider_id = excluded.provider_id,
        title = excluded.title,
        status = excluded.status,
        public_visible = excluded.public_visible,
        display_order = excluded.display_order,
        configuration_ref = excluded.configuration_ref,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(id, request.workspaceId ?? null, request.type, request.providerId ?? null, request.title, request.status, request.publicVisible ? 1 : 0, request.displayOrder, request.configurationRef ?? null)
      .run();
    return { id, ...request };
  }

  async upsertUiContribution(input: unknown) {
    const request = authUiContributionWriteSchema.parse(input);
    const id = request.contributionId;
    await this.db.prepare(`INSERT INTO auth_ui_contributions
      (id, workspace_id, contribution_id, slot, template_id, schema_json, renderer_json, status, display_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        contribution_id = excluded.contribution_id,
        slot = excluded.slot,
        template_id = excluded.template_id,
        schema_json = excluded.schema_json,
        renderer_json = excluded.renderer_json,
        status = excluded.status,
        display_order = excluded.display_order,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(id, request.workspaceId ?? null, request.contributionId, request.slot, request.templateId, JSON.stringify(request.schema ?? { id: request.contributionId, slot: request.slot, displayOrder: request.displayOrder, blocks: request.renderer.body }), JSON.stringify(request.renderer), request.status, request.displayOrder)
      .run();
    return { id, ...request };
  }

  async upsertPolicy(input: unknown, options: { mailDeliveryAvailable?: boolean } = {}) {
    const request = authPolicyWriteSchema.parse(input);
    if (request.requireEmailVerification && !options.mailDeliveryAvailable) throw new Error("Email verification requires a server-side mail delivery adapter before it can be enabled.");
    const workspace = request.workspaceId ?? null;
    const id = workspace ? `workspace:${workspace}` : "global";
    await this.db.prepare(`INSERT INTO auth_policies
      (id, workspace_id, registration_mode, require_email_verification, allow_passkey_registration, allow_passkey_signin, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        registration_mode = excluded.registration_mode,
        require_email_verification = excluded.require_email_verification,
        allow_passkey_registration = excluded.allow_passkey_registration,
        allow_passkey_signin = excluded.allow_passkey_signin,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(id, workspace, request.registrationMode, request.requireEmailVerification ? 1 : 0, request.allowPasskeyRegistration ? 1 : 0, request.allowPasskeySignin ? 1 : 0)
      .run();
    return { id, ...request, workspaceId: workspace };
  }
}
