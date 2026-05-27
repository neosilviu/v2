import { useEffect, useMemo, useState, type FormEvent } from "react";
import { notification } from "@v2/feedback-runtime";
import type { PluginManifest, SurfaceContribution, ToolContribution } from "@v2/plugin-contracts";
import type { Notification } from "@v2/rpc-contracts";
import { Badge, Button, NotificationCenter, SurfaceCard } from "@v2/ui-kit";
import { surfacesInZone, type ShellState } from "@v2/ui-runtime";
import { consumeOwnerSetup, currentWorkspaceId, decideToolApproval, executeTool, invalidateApiCaches, isCoreAuthRequiredError, loadActivePlugins, loadCoreSession, loadCurrentImpersonation, loadCurrentRbac, loadInstalledPlugins, loadOwnerSetup, loadRuntimeTools, loadShellBootstrap, loadWorkspaceUiSurfaces, runtimeSurfaceUrl, saveLayout, setCurrentWorkspaceId, stopCurrentImpersonation, type CoreSession, type ImpersonationContext, type RbacMe, type WorkspaceSummary } from "./api";
import { AuthRequestError, ownerSetupSignUp, signInEmail, signOutAuth, updateAuthProfile } from "./auth-api";
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

function UserMenu({ session, workspace, onOpenProfile, onOpenSettings, onSignOut }: { session: CoreSession | null; workspace: WorkspaceSummary | null; onOpenProfile: () => void; onOpenSettings: () => void; onSignOut: () => void }) {
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
      <small>{workspace?.name ?? workspace?.id ?? "No workspace"}</small>
      <button type="button" onClick={() => closeAndRun(onOpenProfile)}>Edit profile</button>
      <button type="button" onClick={() => closeAndRun(onOpenSettings)}>Settings</button>
      <button type="button" onClick={() => closeAndRun(onSignOut)}>Sign out</button>
    </div> : null}
  </div>;
}

function WorkspaceSwitcher({ workspaces, workspaceId, onChange }: { workspaces: WorkspaceSummary[]; workspaceId: string; onChange: (workspaceId: string) => void }) {
  return <label className="workspace-switcher">
    <small>Workspace</small>
    {workspaces.length ? <select aria-label="Select workspace" value={workspaceId} onChange={(event) => onChange(event.currentTarget.value)}>
      {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.status}</option>)}
    </select> : <strong>No workspaces</strong>}
  </label>;
}

function OverviewPage({ plugins, activePluginIds, tools, surfaces, workspace, permissions, onOpenPlugins, onOpenSettings }: { plugins: PluginManifest[]; activePluginIds: Set<string>; tools: ToolContribution[]; surfaces: SurfaceContribution[]; workspace: WorkspaceSummary | null; permissions: string[]; onOpenPlugins: () => void; onOpenSettings: () => void }) {
  return <>
    <div className="metric-grid">
      <SurfaceCard><small>workspace</small><h2>{workspace?.name ?? "No workspace"}</h2><p>{workspace?.status ?? "No active membership"}</p></SurfaceCard>
      <SurfaceCard><small>capabilities</small><h2>{activePluginIds.size} active</h2><p>{plugins.length} installed feature plugins</p></SurfaceCard>
      <SurfaceCard><small>access</small><h2>{permissions.length} grants</h2><p>{tools.length} runtime tools available from active plugins</p></SurfaceCard>
    </div>
    <div className="section-title"><h2>Setup</h2><Badge>{surfaces.length ? "extended" : "core"}</Badge></div>
    <div className="cards">{surfaces.length ? surfaces.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />) : <SurfaceCard>
      <small>platform dashboard</small>
      <h2>Core workspace is ready</h2>
      <p>Configure security, domains, mail delivery and interface settings before enabling feature plugins.</p>
      <div className="actions"><Button onClick={onOpenSettings}>Open Settings</Button><Button onClick={onOpenPlugins}>Open Plugins</Button></div>
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

function ownerSetupErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AuthRequestError) {
    const code = (error.code ?? "").toLowerCase();
    if (code.includes("expired")) return "This setup token expired. Ask an administrator to issue a new provisioning request.";
    if (code.includes("revoked")) return "This setup token was revoked. Use the latest owner setup email.";
    if (code.includes("consumed") || code.includes("replay")) return "This setup token was already consumed. Sign in to the workspace owner account.";
    if (code.includes("mismatch") || code.includes("email")) return "This setup link only authorizes the owner email shown above.";
    if (code.includes("account") || code.includes("user_exists") || error.status === 409) return "That owner account already exists. Sign in below and activate the setup link.";
    if (code.includes("mail") || code.includes("setup_unavailable")) return "Owner setup mail or provisioning is unavailable. Retry after Core Mail is configured.";
    return error.message || fallback;
  }
  return fallback;
}

function ProfilePage({ session, workspaces, currentWorkspace, onSessionChanged, onOpenSecurity, emit }: { session: CoreSession | null; workspaces: WorkspaceSummary[]; currentWorkspace: WorkspaceSummary | null; onSessionChanged: (session: CoreSession) => void; onOpenSecurity: () => void; emit: (item: Notification) => void }) {
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
        <p>Name: {session?.user?.name ?? "unset"}</p>
      </section>
      <section className="settings-subpanel">
        <h3>Workspace access</h3>
        <p>Roles: {rbac?.roles.map((role) => typeof role === "string" ? role : role.name).join(", ") || "none"}</p>
        <p>Permissions: {rbac?.permissions.length ?? 0}</p>
        {rbac?.recoveryAdmin ? <p className="message">Recovery admin is active for this user.</p> : null}
      </section>
    </div>
    <SurfaceCard>
      <div className="surface-header">
        <div><small>workspace directory</small><h2>Accessible workspaces</h2><p>{workspaces.length ? `${workspaces.length} workspace(s) available` : "No accessible workspaces"}</p></div>
        <Badge>{currentWorkspace?.id ?? "none"}</Badge>
      </div>
      <div className="template-table-wrap domain-table">
        <table>
          <thead>
            <tr>
              <th>Workspace</th>
              <th>Status</th>
              <th>Roles</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.length ? workspaces.map((workspace) => <tr key={workspace.id}>
              <td><strong>{workspace.name}</strong><small>{workspace.id}{workspace.id === currentWorkspace?.id ? " · current" : ""}</small></td>
              <td><Badge>{workspace.status}</Badge></td>
              <td>{workspace.roles.map((role) => role.name).join(", ") || "none"}</td>
              <td>{workspace.permissions.length}</td>
            </tr>) : <tr><td colSpan={4}>No accessible workspaces were returned by Core.</td></tr>}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  </div>;
}

export function App() {
  if (window.location.pathname === "/setup/owner") return <OwnerSetupPage />;
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
  const [impersonation, setImpersonation] = useState<ImpersonationContext | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [notice, setNotice] = useState("runtime ready · no feature plugin required");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const emit = (item: Notification) => setNotifications((current) => [...current, item].slice(-5));
  const dismiss = (id: string) => setNotifications((current) => current.filter((item) => item.id !== id));

  useEffect(() => {
    void loadShellBootstrap().then((bootstrap) => {
      const installed = bootstrap.plugins;
      const activeIds = bootstrap.active;
      const runtimeTools = bootstrap.tools;
      const layout = bootstrap.layout;
      const runtimeSurfaces = bootstrap.surfaces;
      const active = new Set(activeIds);
      const composed = composeShellFromSurfaces(runtimeSurfaces);
      setSession(bootstrap.session);
      setWorkspace(bootstrap.currentWorkspace);
      setWorkspaces(bootstrap.workspaces);
      setPermissions(bootstrap.membership.permissions);
      setAuthStatus("authenticated");
      setPlugins(installed);
      setActivePluginIds(active);
      setTools(runtimeTools);
      setShell(layout ? { ...composed, zones: layout.zones, placements: layout.placements } : composed);
      void loadCurrentImpersonation().then(setImpersonation).catch(() => setImpersonation(null));
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
  const subtitle = selectedPlugin ? "Active plugin workspace" : activePage === "approvals" ? "Approval queue for runtime tool execution" : activePage === "settings" ? "Platform and plugin administration" : activePage === "profile" ? "Account profile and workspace access" : "Workspace status and setup";
  const headerContext = selectedPlugin ? `Plugin ${selectedPlugin.id}` : activePage === "settings" ? "Administration hub" : activePage === "approvals" ? "Approval queue" : activePage === "profile" ? "Account area" : "Workspace overview";
  const headerPills = [
    { label: workspace?.id ?? "no-workspace", value: "workspace" },
    { label: `${activePluginIds.size}/${plugins.length}`, value: "plugins" },
    { label: `${tools.length}`, value: "tools" },
    { label: `${workspaces.length}`, value: "workspaces" },
  ];

  const openPage = (page: Page, path = "/") => {
    setActivePage(page);
    window.history.replaceState(null, "", path);
  };

  const openSecuritySettings = () => openPage("settings", "/settings?tab=platform.settings.security");

  const switchWorkspace = (workspaceId: string) => {
    setCurrentWorkspaceId(workspaceId);
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", workspaceId);
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  };

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
      setNotice(`layout saved: ${currentWorkspaceId()}`);
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
      invalidateApiCaches();
      window.dispatchEvent(new Event("v2-auth-changed"));
      setSession(null);
      setImpersonation(null);
      setAuthStatus("anonymous");
      window.history.replaceState(null, "", "/login");
      emit(notification("success", "Signed out", "The current Auth session was closed."));
    } catch {
      emit(notification("error", "Sign out failed", "Auth service did not close the session."));
    }
  };

  const stopImpersonating = async () => {
    try {
      const result = await stopCurrentImpersonation();
      setImpersonation(null);
      if (result.reauthenticationRequired) {
        setSession(null);
        setAuthStatus("anonymous");
        window.location.assign("/login");
        return;
      }
      window.location.reload();
    } catch {
      emit(notification("error", "Could not stop impersonation", "The original administrator session could not be restored."));
    }
  };

  if (authStatus === "checking") return <SessionCheckPage />;
  if (authStatus === "anonymous") return <LoginPage redirectTo={protectedRedirectTarget()} />;
  if (authStatus === "unavailable") return <SessionCheckPage unavailable />;

  return <>
    {impersonation ? <div role="status" style={{ position: "fixed", inset: "0 0 auto 0", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "0.65rem 1rem", background: "#7c2d12", color: "#fff" }}>
      <strong>Impersonating {session?.user?.email ?? impersonation.subjectUserId}</strong>
      <span>{impersonation.reason}</span>
      <Button onClick={() => void stopImpersonating()}>Stop impersonation</Button>
    </div> : null}
    <div className="app-shell" style={impersonation ? { paddingTop: "3.25rem" } : undefined}>
      <header className="topbar">
        <button className="brand" type="button" onClick={() => openPage("overview")}><strong>v2</strong><Badge>runtime</Badge></button>
        <button className="search" type="button" onClick={() => setPaletteOpen(true)}>Search commands or tools</button>
        <WorkspaceSwitcher workspaces={workspaces} workspaceId={workspace?.id ?? currentWorkspaceId()} onChange={switchWorkspace} />
        <UserMenu session={session} workspace={workspace} onOpenProfile={() => openPage("profile", "/profile")} onOpenSettings={() => openPage("settings", "/settings")} onSignOut={() => void signOut()} />
      </header>
      <aside className="sidebar">
        <div className="sidebar-label">WORKSPACE</div>
        <button className={activePage === "overview" ? "nav active" : "nav"} onClick={() => openPage("overview")}>Dashboard</button>
        <button className={activePage === "plugins" ? "nav active" : "nav"} onClick={() => openPage("plugins", "/plugins")}>Plugins</button>
        <button className={activePage === "approvals" ? "nav active" : "nav"} onClick={() => openPage("approvals", "/approvals")}>Approvals</button>
        <button className={activePage === "settings" ? "nav active" : "nav"} onClick={() => openPage("settings", "/settings")}>Settings</button>
        <div className="sidebar-label">APPS</div>
        {activePlugins.length ? activePlugins.map((plugin) => <button key={plugin.id} className={activePage === `plugin:${plugin.id}` ? "nav active" : "nav"} onClick={() => openPage(`plugin:${plugin.id}`, `/plugins/${encodeURIComponent(plugin.id)}`)}>{plugin.name}</button>) : <p className="message">No active plugins</p>}
        <div className="sidebar-account"><span className="avatar">{userInitial(session)}</span><div><strong>{displayUser(session)}</strong><small>{workspace?.name ?? workspace?.id ?? "no-workspace"}</small></div></div>
      </aside>
      <main className="workspace">
        <div className="workspace-header">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
            <div className="header-meta">
              <Badge>{headerContext}</Badge>
              {headerPills.map((pill) => <Badge key={pill.value}>{pill.label}</Badge>)}
            </div>
          </div>
          <div className="header-actions"><Badge>{workspace?.id ?? "no-workspace"}</Badge><Button onClick={persistLayout}>Save layout</Button></div>
        </div>
        {activePage === "overview" ? <OverviewPage plugins={plugins} activePluginIds={activePluginIds} tools={tools} surfaces={workspaceSurfaces} workspace={workspace} permissions={permissions} onOpenPlugins={() => setActivePage("plugins")} onOpenSettings={() => openPage("settings", "/settings")} /> : null}
        {activePage === "plugins" ? <div className="cards"><PluginManagerPanel plugins={plugins} activePluginIds={activePluginIds} permissions={permissions} onChanged={() => void refreshPlugins()} /></div> : null}
        {activePage === "approvals" ? <div className="cards"><ApprovalsPanel onDecision={() => emit(notification("success", "Approval updated", "The runtime approval queue was updated."))} /></div> : null}
        {activePage === "settings" ? <SettingsPage shell={shell} onShellChange={setShell} emit={emit} workspace={workspace} onRuntimeChanged={(installed, activeIds, runtimeShell) => { setPlugins(installed); setActivePluginIds(activeIds); setShell(runtimeShell); }} /> : null}
        {activePage === "profile" ? <ProfilePage session={session} workspaces={workspaces} currentWorkspace={workspace} onSessionChanged={setSession} onOpenSecurity={openSecuritySettings} emit={emit} /> : null}
        {selectedPlugin ? <PluginPage plugin={selectedPlugin} surfaces={selectedPluginSurfaces} /> : null}
      </main>
      <aside className="assistant">{assistant.length ? assistant.map((surface) => <RuntimeSurface key={surface.id} surface={surface} />) : <div className="message">No assistant plugin surface installed.</div>}</aside>
    <footer className="statusbar"><span>{notice}</span><span>{activePluginIds.size}/{plugins.length} plugins active</span><span>Core {workspace?.id ?? "no-workspace"}</span></footer>
    </div>
    <NotificationCenter notifications={notifications} onDismiss={dismiss} />
    <CommandPalette tools={tools} open={paletteOpen} onClose={() => setPaletteOpen(false)} onExecute={(tool) => void runTool(tool)} />
    <ToolApprovalDialog tool={pendingApproval?.tool ?? null} approvalId={pendingApproval?.approvalId ?? null} onCancel={() => setPendingApproval(null)} onApprove={() => void approvePending()} />
  </>;
}

function OwnerSetupPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const [session, setSession] = useState<CoreSession | null>(null);
  const [setup, setSetup] = useState<{ workspaceId: string; ownerEmail: string; status: string; expiresAt: string } | null>(null);
  const [status, setStatus] = useState("Checking owner setup link...");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [existingPassword, setExistingPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([loadCoreSession().catch(() => null), token ? loadOwnerSetup(token) : Promise.reject(new Error("missing"))])
      .then(([nextSession, nextSetup]) => {
        setSession(nextSession);
        setSetup(nextSetup.setup);
        setStatus(nextSetup.setup.status === "pending" ? "Owner setup link is ready" : `Owner setup is ${nextSetup.setup.status}`);
      })
      .catch(() => setStatus("Owner setup link is unavailable or expired."));
  }, [token]);

  const consume = async () => {
    try {
      setStatus("Activating workspace owner...");
      const result = await consumeOwnerSetup(token);
      setStatus("Owner activated. Opening Security administration...");
      window.location.assign(`/settings?tab=platform.settings.security&workspace=${encodeURIComponent(result.workspaceId)}`);
    } catch (error) {
      setStatus(ownerSetupErrorMessage(error, "Owner setup could not be consumed by the current session."));
    }
  };

  const createOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup || setup.status !== "pending") return;
    if (password.length < 8) {
      setStatus("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("Password confirmation does not match.");
      return;
    }
    setBusy(true);
    try {
      setStatus("Creating owner account...");
      await ownerSetupSignUp({ token, email: setup.ownerEmail, name: name.trim() || setup.ownerEmail, password });
      setStatus("Owner account created. Opening Security administration...");
      window.location.assign(`/settings?tab=platform.settings.security&workspace=${encodeURIComponent(setup.workspaceId)}`);
    } catch (error) {
      setStatus(ownerSetupErrorMessage(error, "Owner account could not be created. If the account already exists, sign in below and activate the setup link."));
    } finally {
      setBusy(false);
    }
  };

  const signInExisting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup || setup.status !== "pending") return;
    setBusy(true);
    try {
      setStatus("Signing in owner account...");
      await signInEmail({ email: setup.ownerEmail, password: existingPassword });
      const nextSession = await loadCoreSession();
      setSession(nextSession);
      await consumeOwnerSetup(token);
      setStatus("Owner activated. Opening Security administration...");
      window.location.assign(`/settings?tab=platform.settings.security&workspace=${encodeURIComponent(setup.workspaceId)}`);
    } catch (error) {
      setStatus(ownerSetupErrorMessage(error, "Existing owner account could not activate this setup link."));
    } finally {
      setBusy(false);
    }
  };

  const signedInEmail = session?.user?.email ?? "";
  const canConsume = Boolean(setup && setup.status === "pending" && session?.authenticated && signedInEmail.toLowerCase() === setup.ownerEmail.toLowerCase());
  const loginTarget = `/login?redirectTo=${encodeURIComponent(`/setup/owner?token=${encodeURIComponent(token)}`)}`;

  return <main className="login-page">
    <SurfaceCard className="login-panel">
      <div className="surface-header"><div><small>workspace provisioning</small><h2>Owner setup</h2></div><Badge>{setup?.status ?? "checking"}</Badge></div>
      <p className="login-status">{status}</p>
      {setup ? <div className="settings-subpanel">
        <p>Workspace: {setup.workspaceId}</p>
        <p>Owner email: {setup.ownerEmail}</p>
        <p>Expires: {new Date(setup.expiresAt).toLocaleString()}</p>
      </div> : null}
      {setup?.status === "expired" ? <p className="login-status">This setup token expired. Ask an administrator to issue a new provisioning request.</p> : null}
      {setup?.status === "consumed" ? <p className="login-status">This setup token was already consumed. Sign in to the workspace owner account.</p> : null}
      {setup?.status === "revoked" ? <p className="login-status">This setup token was revoked. Use the latest owner setup email.</p> : null}
      {setup?.status === "pending" && !session?.authenticated ? <form className="profile-form" onSubmit={(event) => void createOwner(event)}>
        <label className="field">Authorized email<input type="email" value={setup.ownerEmail} readOnly /></label>
        <label className="field">Name<input value={name} onChange={(event) => setName(event.currentTarget.value)} autoComplete="name" /></label>
        <label className="field">Password<input type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} autoComplete="new-password" required /></label>
        <label className="field">Confirm password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} autoComplete="new-password" required /></label>
        <div className="actions"><Button className="primary" type="submit" disabled={busy}>Create owner account</Button></div>
      </form> : null}
      {setup?.status === "pending" && !session?.authenticated ? <form className="profile-form" onSubmit={(event) => void signInExisting(event)}>
        <p className="login-status">Already have this account?</p>
        <label className="field">Password<input type="password" value={existingPassword} onChange={(event) => setExistingPassword(event.currentTarget.value)} autoComplete="current-password" required /></label>
        <div className="actions"><Button type="submit" disabled={busy}>Sign in and activate</Button><Button type="button" onClick={() => window.location.assign(loginTarget)}>Use full sign-in page</Button></div>
      </form> : null}
      {session?.authenticated ? <p className="login-status">Signed in as {signedInEmail}</p> : null}
      {session?.authenticated && setup && signedInEmail.toLowerCase() !== setup.ownerEmail.toLowerCase() ? <p className="login-status">Sign in with the invited owner email to activate this workspace.</p> : null}
      <div className="actions"><Button className="primary" disabled={!canConsume} onClick={() => void consume()}>Activate owner access</Button></div>
    </SurfaceCard>
  </main>;
}
