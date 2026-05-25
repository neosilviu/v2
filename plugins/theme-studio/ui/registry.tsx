import type { ComponentType } from "react";
import type { SurfaceContribution } from "@v2/plugin-contracts";
import { ThemeStudioSurface } from "./ThemeStudioSurface";
type Props = { surface: SurfaceContribution };
const AppearanceSurface: ComponentType<Props> = () => <ThemeStudioSurface />;
export const trustedSurfaces: Record<string, ComponentType<Props>> = { "theme-studio.appearance-settings": AppearanceSurface };
