import type {
  LayoutContribution,
  PluginManifest,
  SurfaceContribution,
  ZoneContribution,
} from "@v2/plugin-contracts";

export type SurfacePlacement = {
  surfaceId: string;
  zoneId: string;
  order: number;
};
export type ShellState = {
  zones: ZoneContribution[];
  surfaces: SurfaceContribution[];
  layouts: LayoutContribution[];
  placements: SurfacePlacement[];
};

export const createShellState = (): ShellState => ({
  zones: [],
  surfaces: [],
  layouts: [],
  placements: [],
});

export function mountSurface(
  state: ShellState,
  placement: SurfacePlacement,
): ShellState {
  if (!state.zones.some((zone) => zone.id === placement.zoneId)) {
    throw new Error(`Zone not found: ${placement.zoneId}`);
  }
  const placements = state.placements.filter(
    (item) => item.surfaceId !== placement.surfaceId,
  );
  return {
    ...state,
    placements: [...placements, placement].sort((a, b) => a.order - b.order),
  };
}

export function moveSurface(
  state: ShellState,
  surfaceId: string,
  zoneId: string,
  order = 0,
): ShellState {
  return mountSurface(state, { surfaceId, zoneId, order });
}

export function addZone(state: ShellState, zone: ZoneContribution): ShellState {
  if (state.zones.some((item) => item.id === zone.id)) return state;
  return { ...state, zones: [...state.zones, zone] };
}

export function removeZone(
  state: ShellState,
  zoneId: string,
  fallbackZoneId: string,
): ShellState {
  if (
    zoneId === fallbackZoneId ||
    !state.zones.some((zone) => zone.id === fallbackZoneId)
  )
    return state;
  const placements = state.placements.map((item) =>
    item.zoneId === zoneId ? { ...item, zoneId: fallbackZoneId } : item,
  );
  return {
    ...state,
    zones: state.zones.filter((zone) => zone.id !== zoneId),
    placements,
  };
}

export function createShellFromPlugins(
  zones: ZoneContribution[],
  plugins: PluginManifest[],
): ShellState {
  const surfaces = plugins.flatMap((plugin) => plugin.contributes.surfaces);
  const layouts = plugins.flatMap((plugin) => plugin.contributes.layouts);
  const state = {
    zones,
    surfaces,
    layouts,
    placements: [] as SurfacePlacement[],
  };
  return surfaces.reduce(
    (next, surface, order) =>
      mountSurface(next, {
        surfaceId: surface.id,
        zoneId: surface.zone,
        order,
      }),
    state,
  );
}

export function surfacesInZone(
  state: ShellState,
  zoneId: string,
): SurfaceContribution[] {
  const ids = state.placements
    .filter((placement) => placement.zoneId === zoneId)
    .map((placement) => placement.surfaceId);
  return ids.flatMap((id) => {
    const surface = state.surfaces.find((item) => item.id === id);
    return surface ? [surface] : [];
  });
}
