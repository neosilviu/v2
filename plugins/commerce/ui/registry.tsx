import type { ComponentType } from "react";
import type { SurfaceContribution } from "@v2/plugin-contracts";
import { CommerceSurface } from "./CommerceSurface";
type Props = { surface: SurfaceContribution };
const DashboardSurface: ComponentType<Props> = () => <CommerceSurface />;
export const trustedSurfaces: Record<string, ComponentType<Props>> = { "commerce.dashboard": DashboardSurface };
