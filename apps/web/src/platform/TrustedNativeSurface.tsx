import type { ComponentType } from "react";
import type { SurfaceContribution } from "@v2/plugin-contracts";

type TrustedSurfaceProps = { surface: SurfaceContribution };
type TrustedRegistryModule = { trustedSurfaces: Record<string, ComponentType<TrustedSurfaceProps>> };

const registryModules = import.meta.glob<TrustedRegistryModule>("../../../../plugins/*/ui/registry.tsx", { eager: true });
const trustedSurfaces = Object.values(registryModules).reduce<Record<string, ComponentType<TrustedSurfaceProps>>>((registry, module) => ({ ...registry, ...module.trustedSurfaces }), {});

export function hasTrustedNativeSurface(surfaceId: string): boolean {
  return surfaceId in trustedSurfaces;
}

export function TrustedNativeSurface({ surface }: TrustedSurfaceProps) {
  const Surface = trustedSurfaces[surface.id];
  return Surface ? <Surface surface={surface} /> : null;
}
