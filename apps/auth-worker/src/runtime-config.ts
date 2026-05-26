import { authPolicySchema, authPolicyWriteSchema, authPublicLoginConfigSchema, authMethodWriteSchema, authUiContributionSchema, authUiContributionWriteSchema, type AuthPublicLoginConfig } from "@v2/auth-contracts";

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

export type RuntimeAuthProviderState = {
  github: boolean;
};

export class AuthRuntimeRepository {
  constructor(private readonly db: D1Database) {}

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
      serverSideAvailability: { password: true, passkey: true, github: providerState.github },
      emailDelivery: { verification: false, passwordReset: false, status: "unavailable" },
      bootstrapAdmin: true,
    };
  }

  async sessionsSummary() {
    const sessionCount = await this.db.prepare("SELECT COUNT(*) AS count FROM session").first<{ count: number }>().catch(() => ({ count: 0 }));
    const passkeyCount = await this.db.prepare("SELECT COUNT(*) AS count FROM passkey").first<{ count: number }>().catch(() => ({ count: 0 }));
    return { sessions: sessionCount?.count ?? 0, passkeys: passkeyCount?.count ?? 0 };
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
