import type { ChannelContribution, LayoutContribution, PluginManifest, ProviderContribution, PublicRouteContribution, PublicSurfaceContribution, PublicToolContribution, SurfaceContribution, ToolContribution, ZoneContribution } from "@v2/plugin-contracts";
import { EventBus } from "./events";
import { RuntimePolicy, type ToolExecutionContext } from "./policy";
import { Registry } from "./registry";

export class RuntimeKernel {
  readonly events = new EventBus();
  readonly policy = new RuntimePolicy();
  readonly plugins = new Registry<PluginManifest>();
  readonly tools = new Registry<ToolContribution>();
  readonly providers = new Registry<ProviderContribution>();
  readonly channels = new Registry<ChannelContribution>();
  readonly surfaces = new Registry<SurfaceContribution>();
  readonly publicRoutes = new Registry<PublicRouteContribution>();
  readonly publicSurfaces = new Registry<PublicSurfaceContribution>();
  readonly publicTools = new Registry<PublicToolContribution>();
  readonly zones = new Registry<ZoneContribution>();
  readonly layouts = new Registry<LayoutContribution>();

  async registerPlugin(plugin: PluginManifest): Promise<void> {
    this.plugins.register(plugin);
    for (const item of plugin.contributes.tools) this.tools.register(item);
    for (const item of plugin.contributes.providers) this.providers.register(item);
    for (const item of plugin.contributes.channels) this.channels.register(item);
    for (const item of plugin.contributes.surfaces) this.surfaces.register(item);
    for (const item of plugin.contributes.publicRoutes) this.publicRoutes.register(item);
    for (const item of plugin.contributes.publicSurfaces) this.publicSurfaces.register(item);
    for (const item of plugin.contributes.publicTools) this.publicTools.register(item);
    for (const item of plugin.contributes.zones) this.zones.register(item);
    for (const item of plugin.contributes.layouts) this.layouts.register(item);
    await this.events.emit("plugin.registered", { pluginId: plugin.id });
  }

  canExecuteTool(toolId: string, context: ToolExecutionContext) {
    const tool = this.tools.get(toolId);
    if (!tool) return "deny" as const;
    return this.policy.decide(tool, context);
  }
}
