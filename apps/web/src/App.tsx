import { useMemo, useState } from "react";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { surfacesInZone } from "@v2/ui-runtime";
import { agentAiPlugin } from "@v2/plugin-agent-ai";
import { themeStudioPlugin } from "@v2/plugin-theme-studio";
import { initialShell } from "./shell";

const plugins = [agentAiPlugin, themeStudioPlugin];

export function App() {
  const [selectedPlugin, setSelectedPlugin] = useState("agent-ai");
  const assistant = useMemo(() => surfacesInZone(initialShell, "assistant.right"), []);
  const settings = useMemo(() => surfacesInZone(initialShell, "settings.appearance"), []);
  return (
    <div className="app-shell">
      <header className="topbar"><strong>v2</strong><Badge>runtime</Badge><div className="search">⌘K Search commands or tools</div><Button>Deploy</Button></header>
      <aside className="sidebar">
        <div className="sidebar-label">PLUGINS</div>
        {plugins.map((plugin) => <button key={plugin.id} className={selectedPlugin === plugin.id ? "nav active" : "nav"} onClick={() => setSelectedPlugin(plugin.id)}>{plugin.name}</button>)}
        <div className="sidebar-label">PLATFORM</div><button className="nav">Plugin Manager</button><button className="nav">Settings</button>
      </aside>
      <main className="workspace">
        <div className="workspace-header"><div><h1>{plugins.find((item) => item.id === selectedPlugin)?.name}</h1><p>Runtime contribution inspector</p></div><Badge>workspace/default</Badge></div>
        <div className="cards">
          {settings.map((surface) => <SurfaceCard key={surface.id}><small>{surface.kind}</small><h2>{surface.title}</h2><p>Rendered from plugin contribution: <code>{surface.id}</code></p><Button>Open</Button></SurfaceCard>)}
          <SurfaceCard><small>core</small><h2>Plugin Manager</h2><p>ZIP install, capability grants and workspace activation live in core.</p><Button>Install plugin</Button></SurfaceCard>
        </div>
      </main>
      <aside className="assistant">
        {assistant.map((surface) => <div className="chat" key={surface.id}><div className="chat-header"><strong>{surface.title}</strong><Badge>#general</Badge></div><div className="message">I can operate active workspace tools after permission checks.</div><div className="composer">Ask Agent AI… <span>↵</span></div></div>)}
      </aside>
      <footer className="statusbar"><span>core connected</span><span>2 built-in plugins</span><span>MCP bridge ready</span></footer>
    </div>
  );
}
