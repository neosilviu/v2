import type { ZoneContribution } from "@v2/plugin-contracts";
import { agentAiPlugin } from "@v2/plugin-agent-ai";
import { aiProvidersPlugin } from "@v2/plugin-ai-providers";
import { themeStudioPlugin } from "@v2/plugin-theme-studio";
import { createShellFromPlugins } from "@v2/ui-runtime";
export const foundationZones: ZoneContribution[] = [
  { id: "navigation.left", title: "Navigation", accepts: ["panel", "widget"] }, { id: "workspace.main", title: "Workspace", accepts: ["panel", "page"] },
  { id: "assistant.right", title: "Assistant", accepts: ["panel"] }, { id: "settings.appearance", title: "Appearance Settings", accepts: ["settings"] }, { id: "settings.integrations", title: "Integration Settings", accepts: ["settings"] },
];
export const initialShell = createShellFromPlugins(foundationZones, [agentAiPlugin, themeStudioPlugin, aiProvidersPlugin]);
