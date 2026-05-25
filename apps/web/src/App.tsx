import { useEffect, useMemo, useState } from "react";
import type { ToolContribution } from "@v2/plugin-contracts";
import { Badge, Button } from "@v2/ui-kit";
import { surfacesInZone, type ShellState } from "@v2/ui-runtime";
import { agentAiPlugin } from "@v2/plugin-agent-ai";
import { aiProvidersPlugin } from "@v2/plugin-ai-providers";
import { themeStudioPlugin } from "@v2/plugin-theme-studio";
import { executeTool, loadLayout, saveLayout } from "./api";
import { initialShell } from "./shell";
import { AgentPanel } from "./platform/AgentPanel";
import { CommandPalette } from "./platform/CommandPalette";
import { PluginManagerPanel } from "./platform/PluginManagerPanel";
import { RuntimeShellEditor } from "./platform/RuntimeShellEditor";
import { SettingsRenderer } from "./platform/SettingsRenderer";
import { ToolApprovalDialog } from "./platform/ToolApprovalDialog";
const plugins = [agentAiPlugin, themeStudioPlugin, aiProvidersPlugin]; const tools = plugins.flatMap((plugin) => plugin.contributes.tools); const settings = plugins.flatMap((plugin) => plugin.contributes.settings);
export function App() {
  const [shell, setShell] = useState<ShellState>(initialShell); const [selectedPlugin, setSelectedPlugin] = useState("agent-ai"); const [paletteOpen, setPaletteOpen] = useState(false); const [pendingTool, setPendingTool] = useState<ToolContribution | null>(null); const [notice, setNotice] = useState("runtime ready");
  useEffect(() => { void loadLayout().then((layout) => { if (layout) setShell((state) => ({ ...state, zones: layout.zones, placements: layout.placements })); }).catch(() => setNotice("core offline · local shell mode")); }, []);
  const assistant = useMemo(() => surfacesInZone(shell, "assistant.right"), [shell]);
  const runTool = async (tool: ToolContribution, approved = false) => { setPaletteOpen(false); try { const result = await executeTool(tool.id, approved); if (result.status === "approval-required") { setPendingTool(tool); return; } setPendingTool(null); setNotice(`${result.status}: ${tool.id}`); } catch { setNotice("core offline · tool unavailable"); } };
  const persistLayout = async () => { try { await saveLayout(shell); setNotice("layout saved: workspace/default"); } catch { setNotice("core offline · layout not saved"); } };
  return <><div className="app-shell"><header className="topbar"><strong>v2</strong><Badge>runtime</Badge><button className="search" onClick={() => setPaletteOpen(true)}>⌘K Search commands or tools</button><Button>Deploy</Button></header><aside className="sidebar"><div className="sidebar-label">PLUGINS</div>{plugins.map((plugin) => <button key={plugin.id} className={selectedPlugin === plugin.id ? "nav active" : "nav"} onClick={() => setSelectedPlugin(plugin.id)}>{plugin.name}</button>)}<div className="sidebar-label">PLATFORM</div><button className="nav active">Plugin Manager</button><button className="nav">Settings</button></aside><main className="workspace"><div className="workspace-header"><div><h1>{plugins.find((item) => item.id === selectedPlugin)?.name}</h1><p>Runtime contribution inspector and UI editor</p></div><div className="header-actions"><Badge>workspace/default</Badge><Button onClick={persistLayout}>Save layout</Button></div></div><div className="cards"><PluginManagerPanel plugins={plugins} /><RuntimeShellEditor state={shell} onChange={setShell} /><SettingsRenderer settings={settings} /></div></main><aside className="assistant">{assistant.length ? assistant.map((surface) => <AgentPanel key={surface.id} title={surface.title} />) : <div className="message">Assistant surface is mounted in another zone.</div>}</aside><footer className="statusbar"><span>{notice}</span><span>{plugins.length} built-in plugins</span><span>MCP bridge ready</span></footer></div><CommandPalette tools={tools} open={paletteOpen} onClose={() => setPaletteOpen(false)} onExecute={(tool) => void runTool(tool)} /><ToolApprovalDialog tool={pendingTool} onCancel={() => setPendingTool(null)} onApprove={() => pendingTool && void runTool(pendingTool, true)} /></>;
}
