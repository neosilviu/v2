import type { ComponentType } from "react";
import type { SurfaceContribution } from "@v2/plugin-contracts";
import { ProviderSettingsSurface } from "./ProviderSettingsSurface";
type Props = { surface: SurfaceContribution };
const SettingsSurface: ComponentType<Props> = () => <ProviderSettingsSurface />;
export const trustedSurfaces: Record<string, ComponentType<Props>> = {
  "ai-providers.settings": SettingsSurface,
};
