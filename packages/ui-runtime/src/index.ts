import type { LayoutContribution, SurfaceContribution, ZoneContribution } from "@v2/plugin-contracts";

export type SurfacePlacement = { surfaceId: string; zoneId: string; order: number };
export type ShellState = { zones: ZoneContribution[]; surfaces: SurfaceContribution[]; layouts: LayoutContribution[]; placements: SurfacePlacement[] };

export const createShellState = (): ShellState => ({ zones: [], surfaces: [], layouts: [], placements: [] });

export function mountSurface(state: ShellState, placement: SurfacePlacement): ShellState {
  const placements = state.placements.filter((item) => item.surfaceId !== placement.surfaceId);
  return { ...state, placements: [...placements, placement].sort((a, b) => a.order - b.order) };
}

export function moveSurface(state: ShellState, surfaceId: string, zoneId: string, order = 0): ShellState {
  return mountSurface(state, { surfaceId, zoneId, order });
}
