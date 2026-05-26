import {
  channelSchema,
  declarativeUiSchema,
  layoutSchema,
  pluginManifestSchema,
  providerSchema,
  publicRouteContributionSchema,
  publicSurfaceContributionSchema,
  publicToolContributionSchema,
  settingsPanelContributionSchema,
  settingsTabContributionSchema,
  surfaceSchema,
  toolSchema,
  zoneSchema,
  type ChannelContribution,
  type DeclarativeUi,
  type LayoutContribution,
  type PluginManifest,
  type PluginManifestInput,
  type ProviderContribution,
  type PublicRouteContribution,
  type PublicSurfaceContribution,
  type PublicToolContribution,
  type SettingsPanelContribution,
  type SettingsTabContribution,
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
export const definePublicRoute = (route: unknown): PublicRouteContribution => publicRouteContributionSchema.parse(route);
export const definePublicSurface = (surface: unknown): PublicSurfaceContribution => publicSurfaceContributionSchema.parse(surface);
export const definePublicTool = (tool: unknown): PublicToolContribution => publicToolContributionSchema.parse(tool);
export const defineDeclarativeUi = (ui: unknown): DeclarativeUi => declarativeUiSchema.parse(ui);
export const defineSettingsTab = (tab: unknown): SettingsTabContribution => settingsTabContributionSchema.parse(tab);
export const defineSettingsPanel = (panel: unknown): SettingsPanelContribution => settingsPanelContributionSchema.parse(panel);
