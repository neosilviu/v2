import { z } from "zod";

export const capabilitySchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  risk: z.enum(["safe", "reversible", "sensitive", "dangerous"]).default("safe"),
});

export const storageModeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("platform"), scopes: z.array(z.string()).default([]) }),
  z.object({ mode: z.literal("namespaced") }),
  z.object({ mode: z.literal("dedicated"), resources: z.array(z.enum(["d1", "kv", "do", "r2", "vectorize", "queues"])).default([]) }),
]);

export const toolSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  risk: z.enum(["safe", "reversible", "sensitive", "dangerous"]).default("safe"),
  exposure: z.array(z.enum(["agent-ai", "mcp", "command"])).default(["agent-ai"]),
});

export const providerSchema = z.object({ id: z.string(), title: z.string(), models: z.array(z.string()).default([]) });
export const channelSchema = z.object({ id: z.string(), title: z.string(), tools: z.array(z.string()).default([]), providers: z.array(z.string()).default([]) });
export const surfaceSchema = z.object({ id: z.string(), title: z.string(), zone: z.string(), kind: z.enum(["panel", "settings", "widget", "page"]).default("panel") });
export const zoneSchema = z.object({ id: z.string(), title: z.string(), accepts: z.array(z.string()).default(["panel", "settings", "widget", "page"]) });
export const layoutSchema = z.object({ id: z.string(), title: z.string(), zones: z.array(z.string()).default([]) });

export const pluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  version: z.string(),
  builtIn: z.boolean().default(false),
  data: storageModeSchema.default({ mode: "none" }),
  capabilities: z.array(capabilitySchema).default([]),
  contributes: z.object({
    tools: z.array(toolSchema).default([]),
    providers: z.array(providerSchema).default([]),
    channels: z.array(channelSchema).default([]),
    surfaces: z.array(surfaceSchema).default([]),
    zones: z.array(zoneSchema).default([]),
    layouts: z.array(layoutSchema).default([]),
  }).default({}),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type ToolContribution = z.infer<typeof toolSchema>;
export type ProviderContribution = z.infer<typeof providerSchema>;
export type ChannelContribution = z.infer<typeof channelSchema>;
export type SurfaceContribution = z.infer<typeof surfaceSchema>;
export type ZoneContribution = z.infer<typeof zoneSchema>;
export type LayoutContribution = z.infer<typeof layoutSchema>;
