import { useEffect, useMemo, useState } from "react";
import { notification } from "@v2/feedback-runtime";
import type { PluginManifest, SurfaceContribution, ToolContribution } from "@v2/plugin-contracts";
import type { Notification } from "@v2/rpc-contracts";
import { Badge, Button, NotificationCenter, SurfaceCard } from "@v2/ui-kit";
import { surfacesInZone, type ShellState } from "@v2/ui-runtime";
import { decideToolApproval, executeTool, loadInstalledPlugins, loadLayout, loadRuntimeTools, runtimeSurfaceUrl, saveLayout } from "./api";
import { composeShell, emptyShell } from "./shell";
import { ApprovalsPanel } from "./platform/ApprovalsPanel";
import { CommandPalette } from "./platform/CommandPalette";
import { PluginManagerPanel } from "./platform/PluginManagerPanel";
import { RuntimeShellEditor } from "./platform/RuntimeShellEditor";
import { SettingsRenderer } from "./platform/SettingsRenderer";
import { hasTrustedNativeSurface, TrustedNativeSurface } from "./platform/TrustedNativeSurface";
import { ToolApprovalDialog } from "./platform/ToolApprovalDialog";

type Page = "overview" | "plugins" | "approvals" | "settings" | `plugin:${string}`;
type PendingApproval = { tool: ToolContribution; approvalId: string };

function RuntimeSurface({ surface }: { surface: SurfaceContribution }) {
  if (hasTrustedNativeSurface(surface.id)) return <TrustedNativeSurface surface={surface} />;
  if (surface.renderer.mode === "sandbox-frame") return <SurfaceCard className="runtime-frame-surface">
    <div className="surface-header"><div><small>external isolated extension</small><h2>{surface.title}</h2></div><Badge>{surface.kind}</Badge></div>
    <iframe className="runtime-frame" title={surface.title} src={runtimeSurfaceUrl(surface.id)} sandbox="allow-scripts" loading="lazy" referrerPolicy="no-referrer" />
  </SurfaceCard>;
  return <SurfaceCard><small>runtime surface</small><h2>{surface.title}</h2><p>{surface.id}</p><Badge>{surface.kind}</Badge></SurfaceCard>;
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  return <div className="user-menu">
    <button className="user-button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="avatar">A</span><span>Admin</span>
    </button>
    {open ? <div className="user-popover">
      <strong>Workspace admin</strong>
      <small>workspace/default</small>
      <button type="button">Account settings</button>
      <button type="button">Sign out</button>
    </div> : null}
  </div>;
}

function OverviewPage({ plugins, tools, surfaces }: { plugins: PluginManifest[]; tools: ToolContribution[]; surfaces: SurfaceContribution[] }) {
  return <>
    <div className="metric-grid">
      <SurfaceCard><small>installed</small><h2>{plugins.length} plugins</h2><p>{plugins.filter((plugin) => plugin.builtIn).length} trusted native packages</p></SurfaceCard>
      <SurfaceCard><small>runtime</small><h2>{tools.length} tools</h2><p>{tools.filter((tool) => tool.risk === "sensitive" || tool.risk === "dangerous").length} approval-gated tools</p></SurfaceCard>
      <SurfaceCard><small>surfaces</small><h2>{surfaces.length} mounted</h2><p>Native and isolated UI contributions</p></SurfaceCard>
    </div>
    <div className="section-title"><h2>Workspace</h2><Badge>{surfaces.length}</Badge></div>
    <div className="cards">{surfaces.length ? surfaces.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />) : <SurfaceCard><small>workspace</small><h2>No workspace surfaces</h2><p>Activate a plugin to mount native pages here.</p></SurfaceCard>}</div>
  </>;
}

function PluginPage({ plugin, surfaces }: { plugin: PluginManifest; surfaces: SurfaceContribution[] }) {
  return <div className="page-stack">
    <SurfaceCard className="plugin-profile">
      <div className="surface-header"><div><small>{plugin.id}</small><h2>{plugin.name}</h2></div><Badge>{plugin.builtIn ? "trusted" : "installed"}</Badge></div>
      <p>{plugin.version} · {plugin.capabilities.length} capabilities · {plugin.contributes.tools.length} tools</p>
    </SurfaceCard>
    <div className="cards">{surfaces.length ? surfaces.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />) : <SurfaceCard><small>plugin</small><h2>No native page</h2><p>This plugin contributes tools or settings without a workspace page.</p></SurfaceCard>}</div>
  </div>;
}

export function App() {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [tools, setTools] = useState<ToolContribution[]>([]);
  const [shell, setShell] = useState<ShellState>(emptyShell);
  const [activePage, setActivePage] = useState<Page>("overview");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [notice, setNotice] = useState("runtime ready · no feature plugin required");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const emit = (item: Notification) => setNotifications((current) => [...current, item].slice(-5));
  const dismiss = (id: string) => setNotifications((current) => current.filter((item) => item.id !== id));

  useEffect(() => {
    void Promise.all([loadInstalledPlugins(), loadRuntimeTools(), loadLayout()]).then(([installed, runtimeTools, layout]) => {
      const composed = composeShell(installed);
      setPlugins(installed);
      setTools(runtimeTools);
      setShell(layout ? { ...composed, zones: layout.zones, placements: layout.placements } : composed);
    }).catch(() => {
      setNotice("core offline · generic empty shell mode");
      emit(notification("warning", "Core unavailable", "The platform shell is running without runtime data."));
    });
  }, []);

  const assistant = useMemo(() => surfacesInZone(shell, "assistant.right"), [shell]);
  const workspaceSurfaces = useMemo(() => surfacesInZone(shell, "workspace.main"), [shell]);
  const appearanceSurfaces = useMemo(() => surfacesInZone(shell, "settings.appearance"), [shell]);
  const integrationSurfaces = useMemo(() => surfacesInZone(shell, "settings.integrations"), [shell]);
  const settings = plugins.flatMap((plugin) => plugin.contributes.settings);
  const pluginId = activePage.startsWith("plugin:") ? activePage.slice(7) : null;
  const selectedPlugin = plugins.find((plugin) => plugin.id === pluginId) ?? null;
  const selectedPluginSurfaces = selectedPlugin ? shell.surfaces.filter((surface) => surface.id.startsWith(`${selectedPlugin.id}.`)) : [];
  const title = selectedPlugin?.name ?? (activePage === "plugins" ? "Plugins" : activePage === "approvals" ? "Approvals" : activePage === "settings" ? "Settings" : "Dashboard");
  const subtitle = selectedPlugin ? "Native plugin workspace" : activePage === "approvals" ? "Approval queue for runtime tool execution" : activePage === "settings" ? "Platform layout, appearance and integration settings" : "Runtime overview and active workspace";

  const runTool = async (tool: ToolContribution, approvalId?: string) => {
    setPaletteOpen(false);
    try {
      const result = await executeTool(tool.id, approvalId);
      if (result.status === "approval-required") {
        setPendingApproval({ tool, approvalId: result.approvalId });
        emit(notification("warning", "Approval required", `${tool.title} requires stored confirmation before execution.`));
        return;
      }
      setPendingApproval(null);
      setNotice(`${result.status}: ${tool.id}`);
      emit(notification(result.status === "executed" ? "success" : "warning", tool.title, `Result: ${result.status}`, "runtime"));
    } catch {
      setNotice("core offline · tool unavailable");
      emit(notification("error", "Tool unavailable", `${tool.title} could not be executed.`, "runtime"));
    }
  };

  const approvePending = async () => {
    if (!pendingApproval) return;
    try {
      await decideToolApproval(pendingApproval.approvalId, "approved");
      await runTool(pendingApproval.tool, pendingApproval.approvalId);
    } catch {
      emit(notification("error", "Approval failed", "The approval could not be recorded or consumed."));
    }
  };

  const persistLayout = async () => {
    try {
      await saveLayout(shell);
      setNotice("layout saved: workspace/default");
      emit(notification("success", "Layout saved", "Workspace layout was updated."));
    } catch {
      setNotice("core offline · layout not saved");
      emit(notification("error", "Layout not saved", "The core service is unavailable."));
    }
  };

  const refreshPlugins = async () => {
    try {
      const installed = await loadInstalledPlugins();
      setPlugins(installed);
      setShell(composeShell(installed));
      setTools(await loadRuntimeTools());
      emit(notification("success", "Plugins refreshed", "Runtime contributions have been reloaded."));
    } catch {
      emit(notification("error", "Refresh failed", "Installed plugins could not be loaded."));
    }
  };

  return <>
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setActivePage("overview")}><strong>v2</strong><Badge>runtime</Badge></button>
        <button className="search" type="button" onClick={() => setPaletteOpen(true)}>Search commands or tools</button>
        <Button>Deploy</Button>
        <UserMenu />
      </header>
      <aside className="sidebar">
        <div className="sidebar-label">WORKSPACE</div>
        <button className={activePage === "overview" ? "nav active" : "nav"} onClick={() => setActivePage("overview")}>Dashboard</button>
        <button className={activePage === "plugins" ? "nav active" : "nav"} onClick={() => setActivePage("plugins")}>Plugins</button>
        <button className={activePage === "approvals" ? "nav active" : "nav"} onClick={() => setActivePage("approvals")}>Approvals</button>
        <button className={activePage === "settings" ? "nav active" : "nav"} onClick={() => setActivePage("settings")}>Settings</button>
        <div className="sidebar-label">APPS</div>
        {plugins.length ? plugins.map((plugin) => <button key={plugin.id} className={activePage === `plugin:${plugin.id}` ? "nav active" : "nav"} onClick={() => setActivePage(`plugin:${plugin.id}`)}>{plugin.name}</button>) : <p className="message">No installed plugins</p>}
        <div className="sidebar-account"><span className="avatar">A</span><div><strong>Admin</strong><small>workspace/default</small></div></div>
      </aside>
      <main className="workspace">
        <div className="workspace-header">
          <div><h1>{title}</h1><p>{subtitle}</p></div>
          <div className="header-actions"><Badge>workspace/default</Badge><Button onClick={persistLayout}>Save layout</Button></div>
        </div>
        {activePage === "overview" ? <OverviewPage plugins={plugins} tools={tools} surfaces={workspaceSurfaces} /> : null}
        {activePage === "plugins" ? <div className="cards"><PluginManagerPanel plugins={plugins} onChanged={() => void refreshPlugins()} /></div> : null}
        {activePage === "approvals" ? <div className="cards"><ApprovalsPanel onDecision={() => emit(notification("success", "Approval updated", "The runtime approval queue was updated."))} /></div> : null}
        {activePage === "settings" ? <div className="cards"><RuntimeShellEditor state={shell} onChange={setShell} /><SettingsRenderer settings={settings} />{appearanceSurfaces.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />)}{integrationSurfaces.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />)}</div> : null}
        {selectedPlugin ? <PluginPage plugin={selectedPlugin} surfaces={selectedPluginSurfaces} /> : null}
      </main>
      <aside className="assistant">{assistant.length ? assistant.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />) : <div className="message">No assistant plugin surface installed.</div>}</aside>
      <footer className="statusbar"><span>{notice}</span><span>{plugins.length} installed plugins</span><span>MCP bridge ready</span></footer>
    </div>
    <NotificationCenter notifications={notifications} onDismiss={dismiss} />
    <CommandPalette tools={tools} open={paletteOpen} onClose={() => setPaletteOpen(false)} onExecute={(tool) => void runTool(tool)} />
    <ToolApprovalDialog tool={pendingApproval?.tool ?? null} approvalId={pendingApproval?.approvalId ?? null} onCancel={() => setPendingApproval(null)} onApprove={() => void approvePending()} />
  </>;
}
