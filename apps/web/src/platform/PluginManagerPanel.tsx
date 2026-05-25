import type { PluginManifest } from "@v2/plugin-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";

export function PluginManagerPanel({ plugins }: { plugins: PluginManifest[] }) {
  return <SurfaceCard className="manager-panel">
    <div className="surface-header"><div><small>core</small><h2>Plugin Manager</h2></div><Button>Upload ZIP</Button></div>
    <p>Native installer, capability approvals and workspace activation.</p>
    <div className="plugin-list">{plugins.map((plugin) => <div className="plugin-row" key={plugin.id}><div><strong>{plugin.name}</strong><small>{plugin.id} · {plugin.version}</small></div><Badge>{plugin.builtIn ? "built-in" : "installed"}</Badge></div>)}</div>
  </SurfaceCard>;
}
