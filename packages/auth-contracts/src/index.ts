import { z } from "zod";
import { declarativeUiSchema } from "@v2/plugin-contracts";
import { slotContributionSchema, templateIdSchema } from "@v2/ui-schema";

export const authMethodTypeSchema = z.enum(["password", "passkey", "social"]);
export const authMethodStatusSchema = z.enum(["draft", "enabled", "disabled"]);
export const authRegistrationModeSchema = z.enum(["disabled", "open", "invitation-only", "admin-created"]);
export const authPolicySchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1).nullable().default(null),
  registrationMode: authRegistrationModeSchema.default("disabled"),
  requireEmailVerification: z.boolean().default(false),
  allowPasskeyRegistration: z.boolean().default(false),
  allowPasskeySignin: z.boolean().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export const loginSlotSchema = z.enum([
  "login.header",
  "login.branding",
  "login.beforeMethods",
  "login.password",
  "login.socialMethods",
  "login.passkey",
  "login.afterMethods",
  "login.footer",
  "login.legal",
]);
export const authMethodSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1).nullable().default(null),
  type: authMethodTypeSchema,
  providerId: z.string().min(1).nullable().default(null),
  title: z.string().min(1),
  status: authMethodStatusSchema.default("draft"),
  publicVisible: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  configurationRef: z.string().min(1).nullable().default(null),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export const authUiContributionStatusSchema = z.enum(["draft", "published", "unpublished"]);
export const authUiContributionSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1).nullable().default(null),
  contributionId: z.string().min(1),
  slot: loginSlotSchema,
  templateId: templateIdSchema.default("auth.login"),
  schema: slotContributionSchema.optional(),
  renderer: declarativeUiSchema,
  status: authUiContributionStatusSchema.default("draft"),
  displayOrder: z.number().int().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export const authPublicLoginConfigSchema = z.object({
  workspaceId: z.string().min(1).nullable().default(null),
  methods: z.array(authMethodSchema.omit({ configurationRef: true }).extend({ status: z.literal("enabled"), publicVisible: z.literal(true) })),
  uiContributions: z.array(authUiContributionSchema.extend({ status: z.literal("published") })),
  features: z.object({ password: z.boolean(), passkey: z.boolean(), social: z.boolean() }),
  policy: authPolicySchema.pick({ registrationMode: true, requireEmailVerification: true, allowPasskeyRegistration: true, allowPasskeySignin: true }),
});
export const authPolicyWriteSchema = authPolicySchema.omit({ id: true, createdAt: true, updatedAt: true }).extend({ workspaceId: z.string().min(1).nullable().optional() });
export const authMethodWriteSchema = z.object({
  workspaceId: z.string().min(1).nullable().optional(),
  type: authMethodTypeSchema,
  providerId: z.string().min(1).nullable().optional(),
  title: z.string().min(1),
  status: authMethodStatusSchema.default("draft"),
  publicVisible: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  configurationRef: z.string().min(1).nullable().optional(),
});
export const authUiContributionWriteSchema = z.object({
  workspaceId: z.string().min(1).nullable().optional(),
  contributionId: z.string().min(1),
  slot: loginSlotSchema,
  templateId: templateIdSchema.default("auth.login"),
  schema: slotContributionSchema.optional(),
  renderer: declarativeUiSchema,
  status: authUiContributionStatusSchema.default("draft"),
  displayOrder: z.number().int().default(0),
});
export type AuthMethod = z.output<typeof authMethodSchema>;
export type AuthPublicLoginConfig = z.output<typeof authPublicLoginConfigSchema>;
export type AuthPolicy = z.output<typeof authPolicySchema>;
export type AuthPolicyWrite = z.output<typeof authPolicyWriteSchema>;
export type AuthUiContribution = z.output<typeof authUiContributionSchema>;
export type LoginSlot = z.output<typeof loginSlotSchema>;
