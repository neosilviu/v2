import { z } from "zod";

export const riskSchema = z.enum(["safe", "reversible", "sensitive", "dangerous"]);
export const exposureSchema = z.enum(["agent-ai", "mcp", "command"]);
export const resourceSchema = z.enum(["d1", "kv", "do", "r2", "vectorize", "queues"]);
export const capabilitySchema = z.object({ id: z.string().min(1), description: z.string().optional(), risk: riskSchema.default("safe") });
export const storageModeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("platform"), scopes: z.array(z.string()).default([]) }),
  z.object({ mode: z.literal("namespaced") }),
  z.object({ mode: z.literal("dedicated"), resources: z.array(resourceSchema).default([]) }),
]);
export const toolSchema = z.object({ id: z.string().min(1), title: z.string(), description: z.string().optional(), permissions: z.array(z.string()).default([]), risk: riskSchema.default("safe"), exposure: z.array(exposureSchema).default(["agent-ai"]) });
export const providerModelSchema = z.object({ id: z.string().min(1), title: z.string(), capabilities: z.array(z.string()).default(["chat"]) });
export const providerSecretFieldSchema = z.object({ id: z.string().min(1), title: z.string(), required: z.boolean().default(true), secret: z.boolean().default(true) });
export const providerSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().optional(),
  adapter: z.enum(["cloudflare-workers-ai", "openai", "gemini", "groq", "github-models", "openai-compatible"]),
  enabled: z.boolean().default(false),
  capabilities: z.array(z.string()).default(["chat"]),
  models: z.array(providerModelSchema).default([]),
  secretFields: z.array(providerSecretFieldSchema).default([]),
});
export const channelSchema = z.object({ id: z.string().min(1), title: z.string(), tools: z.array(z.string()).default([]), providers: z.array(z.string()).default([]) });
export const publicContributionAccessSchema = z.enum(["anonymous", "authenticated"]);
export const publicRouteContributionSchema = z.object({ id: z.string().min(1), title: z.string(), path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/), surfaceId: z.string().min(1).optional(), access: publicContributionAccessSchema.default("anonymous") });
export const publicSurfaceContributionSchema = z.object({ id: z.string().min(1), title: z.string(), surfaceId: z.string().min(1), path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/), access: publicContributionAccessSchema.default("anonymous") });
export const publicToolContributionSchema = z.object({ id: z.string().min(1), title: z.string(), toolId: z.string().min(1), path: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/), access: publicContributionAccessSchema.default("authenticated") });
export const surfaceRendererSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("declarative") }),
  z.object({ mode: z.literal("sandbox-frame"), entry: z.string().regex(/^ui\/[a-zA-Z0-9/_-]+\.html$/) }),
]);
export const surfaceSchema = z.object({ id: z.string().min(1), title: z.string(), zone: z.string(), kind: z.enum(["panel", "settings", "widget", "page"]).default("panel"), renderer: surfaceRendererSchema.default({ mode: "declarative" }) });
export const zoneSchema = z.object({ id: z.string().min(1), title: z.string(), accepts: z.array(z.string()).default(["panel", "settings", "widget", "page"]) });
export const layoutSchema = z.object({ id: z.string().min(1), title: z.string(), zones: z.array(z.string()).default([]) });
export const settingSchema = z.object({ id: z.string().min(1), title: z.string(), section: z.string(), fields: z.array(z.object({ key: z.string(), label: z.string(), type: z.enum(["string", "boolean", "number", "color", "select"]), options: z.array(z.string()).optional() })).default([]) });
const emptyContributions = { tools: [], providers: [], channels: [], surfaces: [], zones: [], layouts: [], settings: [], publicRoutes: [], publicSurfaces: [], publicTools: [] };

export const pluginManifestSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), version: z.string().min(1), builtIn: z.boolean().default(false), data: storageModeSchema.default({ mode: "none" }), capabilities: z.array(capabilitySchema).default([]),
  contributes: z.object({ tools: z.array(toolSchema).default([]), providers: z.array(providerSchema).default([]), channels: z.array(channelSchema).default([]), surfaces: z.array(surfaceSchema).default([]), zones: z.array(zoneSchema).default([]), layouts: z.array(layoutSchema).default([]), settings: z.array(settingSchema).default([]), publicRoutes: z.array(publicRouteContributionSchema).default([]), publicSurfaces: z.array(publicSurfaceContributionSchema).default([]), publicTools: z.array(publicToolContributionSchema).default([]) }).default(emptyContributions),
});
export const pluginPackageDescriptorSchema = z.object({
  manifest: pluginManifestSchema,
  worker: z.object({ entry: z.string().optional(), isolation: z.enum(["none", "platform-worker"]).default("none") }).default({ isolation: "none" }),
  ui: z.object({ mode: z.enum(["declarative", "sandbox-frame"]).default("declarative"), entry: z.string().optional() }).default({ mode: "declarative" }),
});
export const pluginBundleSchema = pluginPackageDescriptorSchema.extend({ package: z.object({ format: z.literal("zip"), sha256: z.string().length(64), sizeBytes: z.number().int().positive(), objectKey: z.string().min(1) }) });
export type Risk = z.infer<typeof riskSchema>;
export type PluginManifestInput = z.input<typeof pluginManifestSchema>;
export type PluginManifest = z.output<typeof pluginManifestSchema>;
export type PluginBundle = z.output<typeof pluginBundleSchema>;
export type ToolContribution = z.output<typeof toolSchema>;
export type ProviderModel = z.output<typeof providerModelSchema>;
export type ProviderContribution = z.output<typeof providerSchema>;
export type ChannelContribution = z.output<typeof channelSchema>;
export type SurfaceRenderer = z.output<typeof surfaceRendererSchema>;
export type SurfaceContribution = z.output<typeof surfaceSchema>;
export type ZoneContribution = z.output<typeof zoneSchema>;
export type LayoutContribution = z.output<typeof layoutSchema>;
export type SettingContribution = z.output<typeof settingSchema>;
export type PublicContributionAccess = z.output<typeof publicContributionAccessSchema>;
export type PublicRouteContribution = z.output<typeof publicRouteContributionSchema>;
export type PublicSurfaceContribution = z.output<typeof publicSurfaceContributionSchema>;
export type PublicToolContribution = z.output<typeof publicToolContributionSchema>;
