import type { ComponentType } from "react";
import type { SurfaceContribution } from "@v2/plugin-contracts";
import { WebsiteStudioSurface } from "./WebsiteStudioSurface";
type Props = { surface: SurfaceContribution };
const EditorSurface: ComponentType<Props> = () => <WebsiteStudioSurface />;
export const trustedSurfaces: Record<string, ComponentType<Props>> = {
  "website-studio.editor": EditorSurface,
};
