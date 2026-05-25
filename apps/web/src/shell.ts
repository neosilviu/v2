import { createShellState, mountSurface } from "@v2/ui-runtime";

export const initialShell = mountSurface(createShellState(), {
  surfaceId: "agent-ai.assistant-panel",
  zoneId: "assistant.right",
  order: 0,
});
