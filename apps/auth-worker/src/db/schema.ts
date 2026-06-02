import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`CURRENT_TIMESTAMP`;

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
    twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    language: text("language"),
    location: text("location"),
    timezone: text("timezone"),
    image: text("image"),
    disabledAt: integer("disabled_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex("user_email_idx").on(table.email),
  }),
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("session_token_idx").on(table.token),
    userIdx: index("session_user_id_idx").on(table.userId),
  }),
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp",
    }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    providerAccountIdx: uniqueIndex("account_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
    userIdx: index("account_user_id_idx").on(table.userId),
  }),
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (table) => ({
    identifierIdx: index("verification_identifier_idx").on(table.identifier),
  }),
);

export const passkey = sqliteTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull(),
    transports: text("transports"),
    createdAt: integer("created_at", { mode: "timestamp" }),
    aaguid: text("aaguid"),
  },
  (table) => ({
    userIdx: index("passkey_user_id_idx").on(table.userId),
    credentialIdx: uniqueIndex("passkey_credential_id_idx").on(
      table.credentialID,
    ),
  }),
);

export const twoFactor = sqliteTable(
  "twoFactor",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: integer("verified", { mode: "boolean" }).notNull().default(true),
  },
  (table) => ({
    userIdx: uniqueIndex("two_factor_user_id_idx").on(table.userId),
  }),
);

export const authMethods = sqliteTable(
  "auth_methods",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    type: text("type", { enum: ["password", "passkey", "social"] }).notNull(),
    providerId: text("provider_id"),
    title: text("title").notNull(),
    status: text("status", { enum: ["draft", "enabled", "disabled"] })
      .notNull()
      .default("draft"),
    publicVisible: integer("public_visible", { mode: "boolean" })
      .notNull()
      .default(false),
    displayOrder: integer("display_order").notNull().default(0),
    configurationRef: text("configuration_ref"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => ({
    workspaceStatusIdx: index("auth_methods_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.publicVisible,
    ),
    orderIdx: index("auth_methods_order_idx").on(
      table.workspaceId,
      table.displayOrder,
    ),
  }),
);

export const authUiContributions = sqliteTable(
  "auth_ui_contributions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    contributionId: text("contribution_id").notNull(),
    slot: text("slot", {
      enum: [
        "login.header",
        "login.branding",
        "login.beforeMethods",
        "login.password",
        "login.socialMethods",
        "login.passkey",
        "login.afterMethods",
        "login.footer",
        "login.legal",
      ],
    }).notNull(),
    templateId: text("template_id").notNull().default("auth.login"),
    schemaJson: text("schema_json").notNull().default("{}"),
    rendererJson: text("renderer_json").notNull(),
    status: text("status", { enum: ["draft", "published", "unpublished"] })
      .notNull()
      .default("draft"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => ({
    workspaceSlotIdx: index("auth_ui_contributions_workspace_slot_idx").on(
      table.workspaceId,
      table.slot,
      table.status,
    ),
    orderIdx: index("auth_ui_contributions_order_idx").on(
      table.workspaceId,
      table.displayOrder,
    ),
  }),
);

export const authPolicies = sqliteTable(
  "auth_policies",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    registrationMode: text("registration_mode", {
      enum: ["disabled", "open", "invitation-only", "admin-created"],
    })
      .notNull()
      .default("disabled"),
    requireEmailVerification: integer("require_email_verification", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    allowPasskeyRegistration: integer("allow_passkey_registration", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    allowPasskeySignin: integer("allow_passkey_signin", { mode: "boolean" })
      .notNull()
      .default(false),
    turnstileEnabled: integer("turnstile_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    turnstileSiteKey: text("turnstile_site_key"),
    turnstileSecretRef: text("turnstile_secret_ref"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => ({
    workspaceIdx: uniqueIndex("auth_policies_workspace_idx").on(
      table.workspaceId,
    ),
  }),
);

export const impersonationSessions = sqliteTable(
  "impersonation_sessions",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorSessionId: text("actor_session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    subjectUserId: text("subject_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    reason: text("reason").notNull(),
    status: text("status", {
      enum: ["pending", "active", "revoked", "expired", "ended"],
    })
      .notNull()
      .default("pending"),
    createdAt: text("created_at").notNull().default(now),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    endedAt: text("ended_at"),
    rootSessionId: text("root_session_id"),
  },
  (table) => ({
    actorIdx: index("impersonation_sessions_actor_idx").on(
      table.actorUserId,
      table.status,
      table.createdAt,
    ),
    subjectIdx: index("impersonation_sessions_subject_idx").on(
      table.subjectUserId,
      table.status,
      table.createdAt,
    ),
    workspaceIdx: index("impersonation_sessions_workspace_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  passkeys: many(passkey),
  twoFactors: many(twoFactor),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, { fields: [passkey.userId], references: [user.id] }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
  user: one(user, { fields: [twoFactor.userId], references: [user.id] }),
}));
