import { authPublicLoginConfigSchema, authMethodWriteSchema, authUiContributionSchema, authUiContributionWriteSchema, type AuthPublicLoginConfig } from "@v2/auth-contracts";

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
        VALUES ('passkey', NULL, 'passkey', NULL, 'Passkey', 'enabled', 1, 30, NULL)`),
      ...(providerState.github ? [this.db.prepare(`INSERT OR IGNORE INTO auth_methods
        (id, workspace_id, type, provider_id, title, status, public_visible, display_order, configuration_ref)
        VALUES ('social.github', NULL, 'social', 'github', 'GitHub', 'enabled', 1, 20, 'env:GITHUB_CLIENT_ID')`)] : []),
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
    const uiContributions = uiRows.results.map((row) => authUiContributionSchema.parse({
      id: row.id,
      workspaceId: row.workspace_id,
      contributionId: row.contribution_id,
      slot: row.slot,
      templateId: row.template_id,
      schema: JSON.parse(row.schema_json) as unknown,
      renderer: JSON.parse(row.renderer_json) as unknown,
      status: row.status,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    return authPublicLoginConfigSchema.parse({
      workspaceId: workspace,
      methods,
      uiContributions,
      features: {
        password: methods.some((method) => method.type === "password"),
        passkey: methods.some((method) => method.type === "passkey"),
        social: methods.some((method) => method.type === "social"),
      },
    });
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
}
