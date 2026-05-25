import type { ChannelContribution, LayoutContribution, PluginManifest, ProviderContribution, SurfaceContribution, ToolContribution, ZoneContribution } from "@v2/plugin-contracts";

export const definePlugin = <T extends PluginManifest>(plugin: T) => plugin;
export const defineTool = <T extends ToolContribution>(tool: T) => tool;
export const defineProvider = <T extends ProviderContribution>(provider: T) => provider;
export const defineChannel = <T extends ChannelContribution>(channel: T) => channel;
export const defineSurface = <T extends SurfaceContribution>(surface: T) => surface;
export const defineZone = <T extends ZoneContribution>(zone: T) => zone;
export const defineLayout = <T extends LayoutContribution>(layout: T) => layout;
