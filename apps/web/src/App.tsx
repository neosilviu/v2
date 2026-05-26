import { useEffect, useMemo, useState, type FormEvent } from "react";
import { notification } from "@v2/feedback-runtime";
import type { PluginManifest, SurfaceContribution, ToolContribution } from "@v2/plugin-contracts";
import type { Notification } from "@v2/rpc-contracts";
import { Badge, Button, NotificationCenter, SurfaceCard } from "@v2/ui-kit";
import { surfacesInZone, type ShellState } from "@v2/ui-runtime";
import { decideToolApproval, executeTool, isCoreAuthRequiredError, loadActivePlugins, loadCoreSession, loadCurrentRbac, loadInstalledPlugins, loadLayout, loadRuntimeTools, loadWorkspaceUiSurfaces, runtimeSurfaceUrl, saveLayout, type CoreSession, type RbacMe } from "./api";
import { signOutAuth, updateAuthProfile } from "./auth-api";
import { composeShellFromSurfaces, emptyShell } from "./shell";
import { ApprovalsPanel } from "./platform/ApprovalsPanel";
import { CommandPalette } from "./platform/CommandPalette";
import { PluginManagerPanel } from "./platform/PluginManagerPanel";
import { DeclarativeSurface } from "./platform/DeclarativeSurface";
import { hasTrustedNativeSurface, TrustedNativeSurface } from "./platform/TrustedNativeSurface";
import { ToolApprovalDialog } from "./platform/ToolApprovalDialog";
import { LoginPage } from "./LoginPage";
import { PublicPage } from "./PublicPage";
import { SettingsPage } from "./SettingsPage";

type Page = "overview" | "plugins" | "approvals" | "settings" | "profile" | `plugin:${string}`;
type PendingApproval = { tool: ToolContribution; approvalId: string };
type AuthStatus = "checking" | "authenticated" | "anonymous" | "unavailable";

function protectedRedirectTarget() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function initialPage(): Page {
  if (window.location.pathname === "/settings" || window.location.pathname === "/marketplace") return "settings";
  if (window.location.pathname === "/profile") return "profile";
  return "overview";
}

function RuntimeSurface({ surface }: { surface: SurfaceContribution }) {
  if (surface.renderer.mode === "declarative" && surface.renderer.schema) return <DeclarativeSurface surface={surface} schema={surface.renderer.schema} />;
  if (hasTrustedNativeSurface(surface.id)) return <TrustedNativeSurface surface={surface} />;
  if (surface.renderer.mode === "sandbox-frame") return <SurfaceCard className="runtime-frame-surface">
    <div className="surface-header"><div><small>external isolated extension</small><h2>{surface.title}</h2></div><Badge>{surface.kind}</Badge></div>
    <iframe className="runtime-frame" title={surface.title} src={runtimeSurfaceUrl(surface.id)} sandbox="allow-scripts" loading="lazy" referrerPolicy="no-referrer" />
  </SurfaceCard>;
  return <SurfaceCard><small>runtime surface</small><h2>{surface.title}</h2><p>{surface.id}</p><Badge>{surface.kind}</Badge></SurfaceCard>;
}

function displayUser(session: CoreSession | null) {
  const user = session?.user;
  return user?.name?.trim() || user?.email || "Workspace user";
}

function userInitial(session: CoreSession | null) {
  return displayUser(session).slice(0, 1).toUpperCase() || "W";
}

function UserMenu({ session, onOpenProfile, onOpenSettings, onSignOut }: { session: CoreSession | null; onOpenProfile: () => void; onOpenSettings: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const closeAndRun = (action: () => void) => {
    setOpen(false);
    action();
  };
  return <div className="user-menu">
    <button className="user-button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="avatar">{userInitial(session)}</span><span>{displayUser(session)}</span>
    </button>
    {open ? <div className="user-popover">
      <strong>{displayUser(session)}</strong>
      {session?.user?.email ? <small>{session.user.email}</small> : null}
      <small>workspace/default</small>
      <button type="button" onClick={() => closeAndRun(onOpenProfile)}>Edit profile</button>
      <button type="button" onClick={() => closeAndRun(onOpenSettings)}>Settings</button>
      <button type="button" onClick={() => closeAndRun(onSignOut)}>Sign out</button>
    </div> : null}
  </div>;
}

function OverviewPage({ plugins, activePluginIds, tools, surfaces, onOpenPlugins }: { plugins: PluginManifest[]; activePluginIds: Set<string>; tools: ToolContribution[]; surfaces: SurfaceContribution[]; onOpenPlugins: () => void }) {
  return <>
    <div className="metric-grid">
      <SurfaceCard><small>workspace active</small><h2>{activePluginIds.size} plugins</h2><p>{plugins.length} installed in Core registry</p></SurfaceCard>
      <SurfaceCard><small>runtime</small><h2>{tools.length} tools</h2><p>{tools.filter((tool) => tool.risk === "sensitive" || tool.risk === "dangerous").length} approval-gated tools</p></SurfaceCard>
      <SurfaceCard><small>surfaces</small><h2>{surfaces.length} mounted</h2><p>Native and isolated UI contributions</p></SurfaceCard>
    </div>
    <div className="section-title"><h2>Workspace</h2><Badge>{surfaces.length}</Badge></div>
    <div className="cards">{surfaces.length ? surfaces.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />) : <SurfaceCard>
      <small>core registry</small>
      <h2>{plugins.length ? "No active workspace surfaces" : "No plugins installed locally"}</h2>
      <p>{plugins.length ? "Activate a plugin that contributes workspace UI to mount native pages here." : "Core returned an empty plugin registry for workspace/default."}</p>
      <div className="actions"><Button onClick={onOpenPlugins}>Open Plugin Manager</Button></div>
    </SurfaceCard>}</div>
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

function SessionCheckPage({ unavailable = false }: { unavailable?: boolean }) {
  return <main className="login-page">
    <SurfaceCard className="login-panel">
      <div className="surface-header"><div><small>core access</small><h2>{unavailable ? "Authentication unavailable" : "Checking session"}</h2></div><Badge>protected</Badge></div>
      <p className="login-status">{unavailable ? "The protected workspace cannot be shown until Core confirms the current session." : "Validating access before loading the workspace shell."}</p>
    </SurfaceCard>
  </main>;
}

function ProfilePage({ session, onSessionChanged, onOpenSecurity, emit }: { session: CoreSession | null; onSessionChanged: (session: CoreSession) => void; onOpenSecurity: () => void; emit: (item: Notification) => void }) {
  const [name, setName] = useState(session?.user?.name ?? "");
  const [rbac, setRbac] = useState<RbacMe | null>(null);
  const [status, setStatus] = useState("Profile ready");
  const [saving, setSaving] = useState(false);

  useEffect(() => setName(session?.user?.name ?? ""), [session?.user?.name]);

  useEffect(() => {
    let alive = true;
    void loadCurrentRbac().then((loaded) => {
      if (!alive) return;
      setRbac(loaded);
    }).catch(() => {
      if (alive) setStatus("RBAC summary unavailable");
    });
    return () => { alive = false; };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setStatus("Saving profile...");
    try {
      await updateAuthProfile({ name });
      const nextSession = await loadCoreSession();
      onSessionChanged(nextSession);
      setStatus("Profile saved");
      emit(notification("success", "Profile saved", "Your account display name was updated."));
    } catch {
      setStatus("Profile could not be saved");
      emit(notification("error", "Profile not saved", "Auth profile update failed."));
    } finally {
      setSaving(false);
    }
  };

  return <div className="page-stack">
    <SurfaceCard>
      <div className="surface-header">
        <div><small>account</small><h2>Edit profile</h2><p>{status}</p></div>
        <Badge>{session?.isAdmin ? "admin" : "member"}</Badge>
      </div>
      <form className="profile-form" onSubmit={submit}>
        <label className="field">Display name<input value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="Your name" /></label>
        <div className="actions"><Button className="primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</Button><Button type="button" onClick={onOpenSecurity}>Security settings</Button></div>
      </form>
    </SurfaceCard>
    <div className="settings-grid">
      <section className="settings-subpanel">
        <h3>Account</h3>
        <p>Email: {session?.user?.email ?? "unknown"}</p>
        <p>User ID: {session?.user?.id ?? "unknown"}</p>
      </section>
      <section className="settings-subpanel">
        <h3>Workspace access</h3>
        <p>Roles: {rbac?.roles.join(", ") || "none"}</p>
        <p>Permissions: {rbac?.permissions.length ?? 0}</p>
        {rbac?.recoveryAdmin ? <p className="message">Recovery admin is active for this user.</p> : null}
      </section>
    </div>
  </div>;
}

export function App() {
  if (window.location.pathname === "/login") return <LoginPage />;
  if (window.location.pathname.startsWith("/public/")) return <PublicPage />;

  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [activePluginIds, setActivePluginIds] = useState<Set<string>>(new Set());
  const [tools, setTools] = useState<ToolContribution[]>([]);
  const [shell, setShell] = useState<ShellState>(emptyShell);
  const [activePage, setActivePage] = useState<Page>(initialPage());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [session, setSession] = useState<CoreSession | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [notice, setNotice] = useState("runtime ready · no feature plugin required");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const emit = (item: Notification) => setNotifications((current) => [...current, item].slice(-5));
  const dismiss = (id: string) => setNotifications((current) => current.filter((item) => item.id !== id));

  useEffect(() => {
    void loadCoreSession().then((session) => {
      if (!session.authenticated) {
        setSession(null);
        setAuthStatus("anonymous");
        setNotice("auth required · workspace runtime data locked");
        return null;
      }
      setSession(session);
      setAuthStatus("authenticated");
      return Promise.all([loadInstalledPlugins(), loadActivePlugins(), loadRuntimeTools(), loadLayout(), loadWorkspaceUiSurfaces()]);
    }).then((result) => {
      if (!result) return;
      const [installed, activeIds, runtimeTools, layout, runtimeSurfaces] = result;
      const active = new Set(activeIds);
      const composed = composeShellFromSurfaces(runtimeSurfaces);
      setPlugins(installed);
      setActivePluginIds(active);
      setTools(runtimeTools);
      setShell(layout ? { ...composed, zones: layout.zones, placements: layout.placements } : composed);
    }).catch((error) => {
      if (isCoreAuthRequiredError(error)) {
        setSession(null);
        setAuthStatus("anonymous");
        setNotice("auth required · workspace runtime data locked");
        return;
      }
      setAuthStatus("unavailable");
      setNotice("core offline · protected shell locked");
    });
  }, []);

  const assistant = useMemo(() => surfacesInZone(shell, "assistant.right"), [shell]);
  const workspaceSurfaces = useMemo(() => surfacesInZone(shell, "workspace.main"), [shell]);
  const activePlugins = useMemo(() => plugins.filter((plugin) => activePluginIds.has(plugin.id)), [activePluginIds, plugins]);
  const pluginId = activePage.startsWith("plugin:") ? activePage.slice(7) : null;
  const selectedPlugin = activePlugins.find((plugin) => plugin.id === pluginId) ?? null;
  const selectedPluginSurfaces = selectedPlugin ? shell.surfaces.filter((surface) => surface.id.startsWith(`${selectedPlugin.id}.`)) : [];
  const title = selectedPlugin?.name ?? (activePage === "plugins" ? "Plugins" : activePage === "approvals" ? "Approvals" : activePage === "settings" ? "Settings" : activePage === "profile" ? "Profile" : "Dashboard");
  const subtitle = selectedPlugin ? "Native plugin workspace" : activePage === "approvals" ? "Approval queue for runtime tool execution" : activePage === "settings" ? "Runtime-composed platform and plugin administration" : activePage === "profile" ? "Account profile and workspace access" : "Runtime overview and active workspace";

  const openPage = (page: Page, path = "/") => {
    setActivePage(page);
    window.history.replaceState(null, "", path);
  };

  const openSecuritySettings = () => openPage("settings", "/settings?tab=platform.settings.security");

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
      const activeIds = await loadActivePlugins();
      const active = new Set(activeIds);
      setPlugins(installed);
      setActivePluginIds(active);
      setShell(composeShellFromSurfaces(await loadWorkspaceUiSurfaces()));
      setTools(await loadRuntimeTools());
      emit(notification("success", "Plugins refreshed", "Runtime contributions have been reloaded."));
    } catch {
      emit(notification("error", "Refresh failed", "Installed plugins could not be loaded."));
    }
  };

  const signOut = async () => {
    try {
      await signOutAuth();
      setSession(null);
      setAuthStatus("anonymous");
      window.history.replaceState(null, "", "/login");
      emit(notification("success", "Signed out", "The current Auth session was closed."));
    } catch {
      emit(notification("error", "Sign out failed", "Auth service did not close the session."));
    }
  };

  if (authStatus === "checking") return <SessionCheckPage />;
  if (authStatus === "anonymous") return <LoginPage redirectTo={protectedRedirectTarget()} />;
  if (authStatus === "unavailable") return <SessionCheckPage unavailable />;

  return <>
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => openPage("overview")}><strong>v2</strong><Badge>runtime</Badge></button>
        <button className="search" type="button" onClick={() => setPaletteOpen(true)}>Search commands or tools</button>
        <UserMenu session={session} onOpenProfile={() => openPage("profile", "/profile")} onOpenSettings={() => openPage("settings", "/settings")} onSignOut={() => void signOut()} />
      </header>
      <aside className="sidebar">
        <div className="sidebar-label">WORKSPACE</div>
        <button className={activePage === "overview" ? "nav active" : "nav"} onClick={() => openPage("overview")}>Dashboard</button>
        <button className={activePage === "plugins" ? "nav active" : "nav"} onClick={() => openPage("plugins", "/plugins")}>Plugins</button>
        <button className={activePage === "approvals" ? "nav active" : "nav"} onClick={() => openPage("approvals", "/approvals")}>Approvals</button>
        <button className={activePage === "settings" ? "nav active" : "nav"} onClick={() => openPage("settings", "/settings")}>Settings</button>
        <div className="sidebar-label">APPS</div>
        {activePlugins.length ? activePlugins.map((plugin) => <button key={plugin.id} className={activePage === `plugin:${plugin.id}` ? "nav active" : "nav"} onClick={() => openPage(`plugin:${plugin.id}`, `/plugins/${encodeURIComponent(plugin.id)}`)}>{plugin.name}</button>) : <p className="message">No active plugins</p>}
        <div className="sidebar-account"><span className="avatar">{userInitial(session)}</span><div><strong>{displayUser(session)}</strong><small>workspace/default</small></div></div>
      </aside>
      <main className="workspace">
        <div className="workspace-header">
          <div><h1>{title}</h1><p>{subtitle}</p></div>
          <div className="header-actions"><Badge>workspace/default</Badge><Button onClick={persistLayout}>Save layout</Button></div>
        </div>
        {activePage === "overview" ? <OverviewPage plugins={plugins} activePluginIds={activePluginIds} tools={tools} surfaces={workspaceSurfaces} onOpenPlugins={() => setActivePage("plugins")} /> : null}
        {activePage === "plugins" ? <div className="cards"><PluginManagerPanel plugins={plugins} activePluginIds={activePluginIds} onChanged={() => void refreshPlugins()} /></div> : null}
        {activePage === "approvals" ? <div className="cards"><ApprovalsPanel onDecision={() => emit(notification("success", "Approval updated", "The runtime approval queue was updated."))} /></div> : null}
        {activePage === "settings" ? <SettingsPage shell={shell} onShellChange={setShell} emit={emit} onRuntimeChanged={(installed, activeIds, runtimeShell) => { setPlugins(installed); setActivePluginIds(activeIds); setShell(runtimeShell); }} /> : null}
        {activePage === "profile" ? <ProfilePage session={session} onSessionChanged={setSession} onOpenSecurity={openSecuritySettings} emit={emit} /> : null}
        {selectedPlugin ? <PluginPage plugin={selectedPlugin} surfaces={selectedPluginSurfaces} /> : null}
      </main>
      <aside className="assistant">{assistant.length ? assistant.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />) : <div className="message">No assistant plugin surface installed.</div>}</aside>
      <footer className="statusbar"><span>{notice}</span><span>{activePluginIds.size}/{plugins.length} plugins active</span><span>Core workspace/default</span></footer>
    </div>
    <NotificationCenter notifications={notifications} onDismiss={dismiss} />
    <CommandPalette tools={tools} open={paletteOpen} onClose={() => setPaletteOpen(false)} onExecute={(tool) => void runTool(tool)} />
    <ToolApprovalDialog tool={pendingApproval?.tool ?? null} approvalId={pendingApproval?.approvalId ?? null} onCancel={() => setPendingApproval(null)} onApprove={() => void approvePending()} />
  </>;
}
