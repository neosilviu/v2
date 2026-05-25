import { useState } from "react";
import type { ShellState } from "@v2/ui-runtime";
import { addZone, moveSurface, removeZone } from "@v2/ui-runtime";
import { Button, SurfaceCard } from "@v2/ui-kit";

export function RuntimeShellEditor({ state, onChange }: { state: ShellState; onChange: (state: ShellState) => void }) {
  const [zoneName, setZoneName] = useState("");
  const surface = state.surfaces[0];
  const add = () => {
    const id = zoneName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!id) return;
    onChange(addZone(state, { id: `custom.${id}`, title: zoneName.trim(), accepts: ["panel", "widget", "page"] }));
    setZoneName("");
  };
  return <SurfaceCard>
    <small>shell runtime</small><h2>Zones & placements</h2>
    <p>{state.zones.length} zones · {state.placements.length} mounted surfaces</p>
    <div className="zone-add"><input value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="New zone" /><Button onClick={add}>Add</Button></div>
    <div className="zone-list">{state.zones.map((zone) => <div className="zone-row" key={zone.id}><span>{zone.title}</span>{zone.id.startsWith("custom.") ? <button onClick={() => onChange(removeZone(state, zone.id, "workspace.main"))}>×</button> : null}</div>)}</div>
    {surface ? <div className="actions"><Button onClick={() => onChange(moveSurface(state, surface.id, "workspace.main"))}>Move Assistant to Main</Button><Button onClick={() => onChange(moveSurface(state, surface.id, surface.zone))}>Reset</Button></div> : null}
  </SurfaceCard>;
}
