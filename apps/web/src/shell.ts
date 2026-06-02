import type {
  PluginManifest,
  SurfaceContribution,
  ZoneContribution,
} from "@v2/plugin-contracts";
import {
  createShellFromPlugins,
  mountSurface,
  type ShellState,
} from "@v2/ui-runtime";

export const foundationZones: ZoneContribution[] = [
  { id: "navigation.left", title: "Navigation", accepts: ["panel", "widget"] },
  { id: "workspace.main", title: "Workspace", accepts: ["panel", "page"] },
  { id: "assistant.right", title: "Assistant", accepts: ["panel"] },
  {
    id: "settings.appearance",
    title: "Appearance Settings",
    accepts: ["settings"],
  },
  {
    id: "settings.integrations",
    title: "Integration Settings",
    accepts: ["settings"],
  },
];

export const emptyShell = createShellFromPlugins(foundationZones, []);
export const composeShell = (plugins: PluginManifest[]) =>
  createShellFromPlugins(foundationZones, plugins);
export const composeShellFromSurfaces = (
  surfaces: SurfaceContribution[],
): ShellState => {
  const initial: ShellState = {
    zones: foundationZones,
    surfaces,
    layouts: [],
    placements: [],
  };
  return surfaces.reduce<ShellState>(
    (state, surface, order) =>
      mountSurface(state, {
        surfaceId: surface.id,
        zoneId: surface.zone,
        order,
      }),
    initial,
  );
};
