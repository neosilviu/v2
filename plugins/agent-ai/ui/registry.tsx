import type { ComponentType } from "react";
import type { SurfaceContribution } from "@v2/plugin-contracts";
import { AgentSurface } from "./AgentSurface";

type Props = { surface: SurfaceContribution };
const AssistantPanel: ComponentType<Props> = () => <AgentSurface />;
export const trustedSurfaces: Record<string, ComponentType<Props>> = {
  "agent-ai.assistant-panel": AssistantPanel,
};
