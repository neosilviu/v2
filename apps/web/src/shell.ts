import type { PluginManifest, ZoneContribution } from "@v2/plugin-contracts";
import { createShellFromPlugins } from "@v2/ui-runtime";

export const foundationZones: ZoneContribution[] = [
  { id: "navigation.left", title: "Navigation", accepts: ["panel", "widget"] },
  { id: "workspace.main", title: "Workspace", accepts: ["panel", "page"] },
  { id: "assistant.right", title: "Assistant", accepts: ["panel"] },
  { id: "settings.appearance", title: "Appearance Settings", accepts: ["settings"] },
  { id: "settings.integrations", title: "Integration Settings", accepts: ["settings"] },
];

export const emptyShell = createShellFromPlugins(foundationZones, []);
export const composeShell = (plugins: PluginManifest[]) => createShellFromPlugins(foundationZones, plugins);
