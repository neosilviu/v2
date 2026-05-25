import type { ZoneContribution } from "@v2/plugin-contracts";
import { createShellState, mountSurface, type ShellState } from "@v2/ui-runtime";

const foundationZones: ZoneContribution[] = [
  { id: "navigation.left", title: "Navigation", accepts: ["panel", "widget"] },
  { id: "workspace.main", title: "Workspace", accepts: ["panel", "page"] },
  { id: "assistant.right", title: "Assistant", accepts: ["panel"] },
  { id: "settings.appearance", title: "Appearance Settings", accepts: ["settings"] },
];

export const initialShell: ShellState = mountSurface(
  { ...createShellState(), zones: foundationZones },
  { surfaceId: "agent-ai.assistant-panel", zoneId: "assistant.right", order: 0 },
);
