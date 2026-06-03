import type { SurfaceContribution } from "@v2/plugin-contracts";
import { SurfaceCard } from "@v2/ui-kit";
import { DeclarativeSurface } from "./DeclarativeSurface";
import {
  hasTrustedNativeSurface,
  TrustedNativeSurface,
} from "./TrustedNativeSurface";

export function RuntimeSurfaceZone({
  surfaces,
  zoneId,
  emptyMessage,
}: {
  surfaces: SurfaceContribution[];
  zoneId: string;
  emptyMessage?: string;
}) {
  const mounted = surfaces.filter((surface) => surface.zone === zoneId);
  if (!mounted.length)
    return emptyMessage ? <div className="message">{emptyMessage}</div> : null;
  return (
    <>
      {mounted.map((surface) => {
        if (hasTrustedNativeSurface(surface.id))
          return <TrustedNativeSurface key={surface.id} surface={surface} />;
        if (surface.renderer.mode === "declarative") {
          return (
            <DeclarativeSurface
              key={surface.id}
              surface={surface}
              schema={surface.renderer.schema ?? { body: [] }}
            />
          );
        }
        return (
          <SurfaceCard key={surface.id}>
            <p className="message">
              {surface.title} uses an isolated runtime surface.
            </p>
          </SurfaceCard>
        );
      })}
    </>
  );
}
