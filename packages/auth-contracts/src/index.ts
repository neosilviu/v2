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
export const authSignInEmailRequestSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const authUpdateUserRequestSchema = z.object({
  name: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
});
export const authProfilePasskeySchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable().default(null),
  deviceType: z.string().min(1),
  backedUp: z.boolean(),
  createdAt: z.union([z.number(), z.string()]),
});
export const authProfileSessionSchema = z.object({
  id: z.string().min(1),
  current: z.boolean().default(false),
  ipAddress: z.string().nullable().default(null),
  userAgent: z.string().nullable().default(null),
  createdAt: z.union([z.number(), z.string()]),
  expiresAt: z.union([z.number(), z.string()]),
  impersonatedBy: z.string().nullable().default(null),
});
export const authProfileSchema = z.object({
  profile: z.object({
    id: z.string().min(1),
    name: z.string().nullable(),
    email: z.string().email(),
    emailVerified: z.boolean(),
    twoFactorEnabled: z.boolean(),
    language: z.string().nullable(),
    location: z.string().nullable(),
    timezone: z.string().nullable(),
    passkeys: z.array(authProfilePasskeySchema),
    sessions: z.number().int().nonnegative(),
    activeSessions: z.array(authProfileSessionSchema),
    createdAt: z.union([z.number(), z.string()]),
    updatedAt: z.union([z.number(), z.string()]),
    isPlatformAdmin: z.boolean(),
  }),
});
export const ownerSetupSignupRequestSchema = z.object({ token: z.string().min(24), email: z.string().email(), name: z.string().min(1), password: z.string().min(8) });
export type AuthMethod = z.output<typeof authMethodSchema>;
export type AuthPublicLoginConfig = z.output<typeof authPublicLoginConfigSchema>;
export type AuthPolicy = z.output<typeof authPolicySchema>;
export type AuthPolicyWrite = z.output<typeof authPolicyWriteSchema>;
export type AuthUiContribution = z.output<typeof authUiContributionSchema>;
export type AuthProfilePasskey = z.output<typeof authProfilePasskeySchema>;
export type AuthProfileSession = z.output<typeof authProfileSessionSchema>;
export type LoginSlot = z.output<typeof loginSlotSchema>;
export type AuthSignInEmailRequest = z.output<typeof authSignInEmailRequestSchema>;
export type AuthUpdateUserRequest = z.output<typeof authUpdateUserRequestSchema>;
export type AuthProfile = z.output<typeof authProfileSchema>["profile"];
export type OwnerSetupSignupRequest = z.output<typeof ownerSetupSignupRequestSchema>;
