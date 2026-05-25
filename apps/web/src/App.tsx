import { useEffect, useMemo, useState } from "react";
import { notification } from "@v2/feedback-runtime";
import type { PluginManifest, SurfaceContribution, ToolContribution } from "@v2/plugin-contracts";
import type { Notification } from "@v2/rpc-contracts";
import { Badge, Button, NotificationCenter, SurfaceCard } from "@v2/ui-kit";
import { surfacesInZone, type ShellState } from "@v2/ui-runtime";
import { executeTool, loadInstalledPlugins, loadLayout, loadRuntimeTools, runtimeSurfaceUrl, saveLayout } from "./api";
import { composeShell, emptyShell } from "./shell";
import { CommandPalette } from "./platform/CommandPalette";
import { PluginManagerPanel } from "./platform/PluginManagerPanel";
import { RuntimeShellEditor } from "./platform/RuntimeShellEditor";
import { SettingsRenderer } from "./platform/SettingsRenderer";
import { hasTrustedNativeSurface, TrustedNativeSurface } from "./platform/TrustedNativeSurface";
import { ToolApprovalDialog } from "./platform/ToolApprovalDialog";

function RuntimeSurface({ surface }: { surface: SurfaceContribution }) {
  if (hasTrustedNativeSurface(surface.id)) return <TrustedNativeSurface surface={surface} />;
  if (surface.renderer.mode === "sandbox-frame") return <SurfaceCard className="runtime-frame-surface"><div className="surface-header"><div><small>external isolated extension</small><h2>{surface.title}</h2></div><Badge>{surface.kind}</Badge></div><iframe className="runtime-frame" title={surface.title} src={runtimeSurfaceUrl(surface.id)} sandbox="allow-scripts" loading="lazy" referrerPolicy="no-referrer" /></SurfaceCard>;
  return <SurfaceCard><small>runtime surface</small><h2>{surface.title}</h2><p>{surface.id}</p><Badge>{surface.kind}</Badge></SurfaceCard>;
}

export function App() {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [tools, setTools] = useState<ToolContribution[]>([]);
  const [shell, setShell] = useState<ShellState>(emptyShell);
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingTool, setPendingTool] = useState<ToolContribution | null>(null);
  const [notice, setNotice] = useState("runtime ready · no feature plugin required");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const emit = (item: Notification) => setNotifications((current) => [...current, item].slice(-5));
  const dismiss = (id: string) => setNotifications((current) => current.filter((item) => item.id !== id));

  useEffect(() => { void Promise.all([loadInstalledPlugins(), loadRuntimeTools(), loadLayout()]).then(([installed, runtimeTools, layout]) => { const composed = composeShell(installed); setPlugins(installed); setTools(runtimeTools); setSelectedPlugin(installed[0]?.id ?? null); setShell(layout ? { ...composed, zones: layout.zones, placements: layout.placements } : composed); }).catch(() => { setNotice("core offline · generic empty shell mode"); emit(notification("warning", "Core unavailable", "The platform shell is running without runtime data.")); }); }, []);
  const assistant = useMemo(() => surfacesInZone(shell, "assistant.right"), [shell]);
  const workspaceSurfaces = useMemo(() => surfacesInZone(shell, "workspace.main"), [shell]);
  const appearanceSurfaces = useMemo(() => surfacesInZone(shell, "settings.appearance"), [shell]);
  const selected = plugins.find((plugin) => plugin.id === selectedPlugin);
  const settings = plugins.flatMap((plugin) => plugin.contributes.settings);
  const runTool = async (tool: ToolContribution, approved = false) => { setPaletteOpen(false); try { const result = await executeTool(tool.id, approved); if (result.status === "approval-required") { setPendingTool(tool); emit(notification("warning", "Approval required", `${tool.title} requires confirmation before execution.`)); return; } setPendingTool(null); setNotice(`${result.status}: ${tool.id}`); emit(notification(result.status === "executed" ? "success" : "warning", tool.title, `Result: ${result.status}`, "runtime")); } catch { setNotice("core offline · tool unavailable"); emit(notification("error", "Tool unavailable", `${tool.title} could not be executed.`, "runtime")); } };
  const persistLayout = async () => { try { await saveLayout(shell); setNotice("layout saved: workspace/default"); emit(notification("success", "Layout saved", "Workspace layout was updated.")); } catch { setNotice("core offline · layout not saved"); emit(notification("error", "Layout not saved", "The core service is unavailable.")); } };
  const refreshPlugins = async () => { try { const installed = await loadInstalledPlugins(); setPlugins(installed); setShell(composeShell(installed)); setTools(await loadRuntimeTools()); setSelectedPlugin(installed[0]?.id ?? null); emit(notification("success", "Plugins refreshed", "Runtime contributions have been reloaded.")); } catch { emit(notification("error", "Refresh failed", "Installed plugins could not be loaded.")); } };
  return <><div className="app-shell"><header className="topbar"><strong>v2</strong><Badge>runtime</Badge><button className="search" onClick={() => setPaletteOpen(true)}>⌘K Search commands or tools</button><Button>Deploy</Button></header><aside className="sidebar"><div className="sidebar-label">PLUGINS</div>{plugins.length ? plugins.map((plugin) => <button key={plugin.id} className={selectedPlugin === plugin.id ? "nav active" : "nav"} onClick={() => setSelectedPlugin(plugin.id)}>{plugin.name}</button>) : <p className="message">No installed plugins</p>}<div className="sidebar-label">PLATFORM</div><button className="nav active">Plugin Manager</button><button className="nav">Settings</button></aside><main className="workspace"><div className="workspace-header"><div><h1>{selected?.name ?? "Platform"}</h1><p>Runtime contribution inspector and native plugin workspace</p></div><div className="header-actions"><Badge>workspace/default</Badge><Button onClick={persistLayout}>Save layout</Button></div></div><div className="cards"><PluginManagerPanel plugins={plugins} onChanged={() => void refreshPlugins()} /><RuntimeShellEditor state={shell} onChange={setShell} /><SettingsRenderer settings={settings} />{appearanceSurfaces.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />)}{workspaceSurfaces.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />)}</div></main><aside className="assistant">{assistant.length ? assistant.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />) : <div className="message">No assistant plugin surface installed.</div>}</aside><footer className="statusbar"><span>{notice}</span><span>{plugins.length} installed plugins</span><span>MCP bridge ready</span></footer></div><NotificationCenter notifications={notifications} onDismiss={dismiss} /><CommandPalette tools={tools} open={paletteOpen} onClose={() => setPaletteOpen(false)} onExecute={(tool) => void runTool(tool)} /><ToolApprovalDialog tool={pendingTool} onCancel={() => setPendingTool(null)} onApprove={() => pendingTool && void runTool(pendingTool, true)} /></>;
}
