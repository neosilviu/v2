import type { LayoutContribution, PluginManifest, SurfaceContribution, ZoneContribution } from "@v2/plugin-contracts";

export type SurfacePlacement = { surfaceId: string; zoneId: string; order: number };
export type ShellState = {
  zones: ZoneContribution[];
  surfaces: SurfaceContribution[];
  layouts: LayoutContribution[];
  placements: SurfacePlacement[];
};

export const createShellState = (): ShellState => ({ zones: [], surfaces: [], layouts: [], placements: [] });

export function mountSurface(state: ShellState, placement: SurfacePlacement): ShellState {
  const placements = state.placements.filter((item) => item.surfaceId !== placement.surfaceId);
  return { ...state, placements: [...placements, placement].sort((a, b) => a.order - b.order) };
}

export function moveSurface(state: ShellState, surfaceId: string, zoneId: string, order = 0): ShellState {
  return mountSurface(state, { surfaceId, zoneId, order });
}

export function createShellFromPlugins(zones: ZoneContribution[], plugins: PluginManifest[]): ShellState {
  const surfaces = plugins.flatMap((plugin) => plugin.contributes.surfaces);
  const layouts = plugins.flatMap((plugin) => plugin.contributes.layouts);
  const placements = surfaces.map((surface, order) => ({ surfaceId: surface.id, zoneId: surface.zone, order }));
  return { zones, surfaces, layouts, placements };
}

export function surfacesInZone(state: ShellState, zoneId: string): SurfaceContribution[] {
  const ids = state.placements.filter((placement) => placement.zoneId === zoneId).map((placement) => placement.surfaceId);
  return ids.flatMap((id) => {
    const surface = state.surfaces.find((item) => item.id === id);
    return surface ? [surface] : [];
  });
}
