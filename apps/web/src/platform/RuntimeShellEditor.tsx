import type { ShellState } from "@v2/ui-runtime";
import { moveSurface } from "@v2/ui-runtime";
import { Button, SurfaceCard } from "@v2/ui-kit";

export function RuntimeShellEditor({ state, onChange }: { state: ShellState; onChange: (state: ShellState) => void }) {
  const surface = state.surfaces[0];
  return <SurfaceCard>
    <small>shell runtime</small><h2>Zones & placements</h2>
    <p>{state.zones.length} zones · {state.placements.length} mounted surfaces</p>
    {surface ? <div className="actions"><Button onClick={() => onChange(moveSurface(state, surface.id, "workspace.main"))}>Move first to Main</Button><Button onClick={() => onChange(moveSurface(state, surface.id, surface.zone))}>Reset</Button></div> : null}
  </SurfaceCard>;
}
