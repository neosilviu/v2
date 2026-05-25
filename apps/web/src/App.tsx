import { useMemo, useState } from "react";
import { Badge, Button } from "@v2/ui-kit";
import { surfacesInZone, type ShellState } from "@v2/ui-runtime";
import { agentAiPlugin } from "@v2/plugin-agent-ai";
import { themeStudioPlugin } from "@v2/plugin-theme-studio";
import { initialShell } from "./shell";
import { CommandPalette } from "./platform/CommandPalette";
import { PluginManagerPanel } from "./platform/PluginManagerPanel";
import { RuntimeShellEditor } from "./platform/RuntimeShellEditor";
import { SettingsRenderer } from "./platform/SettingsRenderer";

const plugins = [agentAiPlugin, themeStudioPlugin];
const tools = plugins.flatMap((plugin) => plugin.contributes.tools);
const settings = plugins.flatMap((plugin) => plugin.contributes.settings);

export function App() {
  const [shell, setShell] = useState<ShellState>(initialShell);
  const [selectedPlugin, setSelectedPlugin] = useState("agent-ai");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const assistant = useMemo(() => surfacesInZone(shell, "assistant.right"), [shell]);
  return <>
    <div className="app-shell">
      <header className="topbar"><strong>v2</strong><Badge>runtime</Badge><button className="search" onClick={() => setPaletteOpen(true)}>⌘K Search commands or tools</button><Button>Deploy</Button></header>
      <aside className="sidebar"><div className="sidebar-label">PLUGINS</div>{plugins.map((plugin) => <button key={plugin.id} className={selectedPlugin === plugin.id ? "nav active" : "nav"} onClick={() => setSelectedPlugin(plugin.id)}>{plugin.name}</button>)}<div className="sidebar-label">PLATFORM</div><button className="nav active">Plugin Manager</button><button className="nav">Settings</button></aside>
      <main className="workspace"><div className="workspace-header"><div><h1>{plugins.find((item) => item.id === selectedPlugin)?.name}</h1><p>Runtime contribution inspector and UI editor</p></div><Badge>workspace/default</Badge></div><div className="cards"><PluginManagerPanel plugins={plugins} /><RuntimeShellEditor state={shell} onChange={setShell} /><SettingsRenderer settings={settings} /></div></main>
      <aside className="assistant">{assistant.map((surface) => <div className="chat" key={surface.id}><div className="chat-header"><strong>{surface.title}</strong><Badge>#general</Badge></div><div className="message">I can operate active workspace tools after permission checks.</div><div className="composer">Ask Agent AI… <span>↵</span></div></div>)}</aside>
      <footer className="statusbar"><span>core connected</span><span>{plugins.length} built-in plugins</span><span>MCP bridge ready</span></footer>
    </div><CommandPalette tools={tools} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
  </>;
}
