import {
  channelSchema,
  layoutSchema,
  pluginManifestSchema,
  providerSchema,
  surfaceSchema,
  toolSchema,
  zoneSchema,
  type ChannelContribution,
  type LayoutContribution,
  type PluginManifest,
  type PluginManifestInput,
  type ProviderContribution,
  type SurfaceContribution,
  type ToolContribution,
  type ZoneContribution,
} from "@v2/plugin-contracts";

export const definePlugin = (plugin: PluginManifestInput): PluginManifest => pluginManifestSchema.parse(plugin);
export const defineTool = (tool: unknown): ToolContribution => toolSchema.parse(tool);
export const defineProvider = (provider: unknown): ProviderContribution => providerSchema.parse(provider);
export const defineChannel = (channel: unknown): ChannelContribution => channelSchema.parse(channel);
export const defineSurface = (surface: unknown): SurfaceContribution => surfaceSchema.parse(surface);
export const defineZone = (zone: unknown): ZoneContribution => zoneSchema.parse(zone);
export const defineLayout = (layout: unknown): LayoutContribution => layoutSchema.parse(layout);
