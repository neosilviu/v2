import { z } from "zod";

export const mailProviderKindSchema = z.enum(["smtp", "transactional-http", "mock-development-only"]);
export const mailProviderStatusSchema = z.enum(["draft", "configured", "active", "disabled", "error"]);
export const mailTemplateKeySchema = z.enum(["owner_setup", "workspace_invite", "verify_email", "reset_password", "notification_generic"]);
export const mailTemplateStatusSchema = z.enum(["draft", "active", "disabled"]);
export const mailDeliveryStatusSchema = z.enum(["queued", "sent", "failed"]);
export const mailPurposeSchema = z.enum(["owner_setup", "workspace_invite", "verify_email", "reset_password", "notification_generic", "test"]);

export const mailProviderSafeConfigSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.number().int().positive().optional(),
  secure: z.enum(["none", "starttls", "tls"]).optional(),
  usernameConfigured: z.boolean().default(false),
  passwordConfigured: z.boolean().default(false),
  secretHint: z.string().nullable().default(null),
});

export const mailProviderPublicSummarySchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  kind: mailProviderKindSchema,
  label: z.string().min(1),
  status: mailProviderStatusSchema,
  enabled: z.boolean(),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyToEmail: z.string().email().nullable().default(null),
  safeConfig: mailProviderSafeConfigSchema.default({ usernameConfigured: false, passwordConfigured: false, secretHint: null }),
  isDefaultTransactional: z.boolean(),
  lastTestedAt: z.string().nullable().default(null),
  lastTestStatus: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const mailProviderConfigureSchema = z.object({
  kind: mailProviderKindSchema.default("smtp"),
  label: z.string().min(1),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyToEmail: z.string().email().nullable().optional(),
  safeConfig: mailProviderSafeConfigSchema.default({ usernameConfigured: false, passwordConfigured: false, secretHint: null }),
  configurationRef: z.string().min(1).nullable().optional(),
  enabled: z.boolean().default(true),
});

export const mailTemplateSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  templateKey: mailTemplateKeySchema,
  subjectTemplate: z.string().min(1),
  bodyTextTemplate: z.string().min(1),
  bodyHtmlTemplate: z.string().nullable().default(null),
  status: mailTemplateStatusSchema,
  locale: z.string().min(2).default("ro-RO"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const mailTemplateWriteSchema = mailTemplateSchema.pick({
  templateKey: true,
  subjectTemplate: true,
  bodyTextTemplate: true,
  bodyHtmlTemplate: true,
  status: true,
  locale: true,
});

export const mailMessageRequestSchema = z.object({
  workspaceId: z.string().min(1),
  templateKey: mailTemplateKeySchema.optional(),
  purpose: mailPurposeSchema,
  to: z.string().email(),
  subject: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  html: z.string().min(1).optional(),
  variables: z.record(z.string(), z.string()).default({}),
});

export const mailDeliveryResultSchema = z.object({
  ok: z.boolean(),
  status: mailDeliveryStatusSchema,
  providerId: z.string().min(1).nullable(),
  eventId: z.string().min(1),
  errorSafe: z.string().nullable().default(null),
});

export const mailProviderTestRequestSchema = z.object({
  to: z.string().email(),
});

export const mailProviderTestResultSchema = z.object({
  ok: z.boolean(),
  status: z.enum(["sent", "failed", "unavailable"]),
  providerId: z.string().min(1),
  message: z.string(),
  eventId: z.string().nullable().default(null),
});

export type MailProviderKind = z.output<typeof mailProviderKindSchema>;
export type MailProviderPublicSummary = z.output<typeof mailProviderPublicSummarySchema>;
export type MailProviderConfigure = z.output<typeof mailProviderConfigureSchema>;
export type MailTemplate = z.output<typeof mailTemplateSchema>;
export type MailMessageRequest = z.output<typeof mailMessageRequestSchema>;
export type MailDeliveryResult = z.output<typeof mailDeliveryResultSchema>;
export type MailProviderTestRequest = z.output<typeof mailProviderTestRequestSchema>;
export type MailProviderTestResult = z.output<typeof mailProviderTestResultSchema>;
