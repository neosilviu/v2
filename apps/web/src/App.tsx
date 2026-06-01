import { useEffect, useMemo, useState, type FormEvent } from "react";
import { notification } from "@v2/feedback-runtime";
import type { Notification } from "@v2/rpc-contracts";
import { Badge, Button, NotificationCenter, SurfaceCard } from "@v2/ui-kit";
import type { ShellState } from "@v2/ui-runtime";
import { consumeOwnerSetup, currentWorkspaceId, invalidateApiCaches, isCoreAuthRequiredError, loadCoreSession, loadCurrentImpersonation, loadOwnerSetup, loadRuntimePage, loadStartupBootstrap, saveLayout, setCurrentWorkspaceId, stopCurrentImpersonation, type CoreSession, type ImpersonationContext, type RuntimeNavigationItem, type ShellBootstrap, type WorkspaceSummary } from "./api";
import { AuthRequestError, ownerSetupSignUp, signInEmail, signOutAuth } from "./auth-api";
import { emptyShell } from "./shell";
import { ApprovalsPanel } from "./platform/ApprovalsPanel";
import { TemplateRenderer } from "./platform/TemplateRenderer";
import { AccountPage, displayUser, userInitial, UserMenu, WorkspaceSwitcher } from "./platform/AccountShell";
import { LoginPage } from "./LoginPage";
import { PublicPage } from "./PublicPage";
import { SettingsPage } from "./SettingsPage";

type AuthStatus = "checking" | "authenticated" | "anonymous" | "unavailable";

function protectedRedirectTarget() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function shellFromBootstrap(bootstrap: ShellBootstrap): ShellState {
  if (!bootstrap.layout) return emptyShell;
  return { ...emptyShell, zones: bootstrap.layout.zones, placements: bootstrap.layout.placements };
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function navigationGroup(item: RuntimeNavigationItem) {
  if (item.section === "administration") {
    const label = normalizeLabel(item.label);
    if (label.includes("market") || label.includes("interface") || label.includes("setting")) return "Administration";
    if (label.includes("audit") || label.includes("approval")) return "Operations";
    return "Administration";
  }
  const label = normalizeLabel(item.label);
  if (item.id === "platform.home" || label === "home" || label.includes("dashboard")) return "Home";
  if (label.includes("account") || label.includes("profile") || label.includes("passkey")) return "Account";
  if (label.includes("builder") || label.includes("form") || label.includes("studio")) return "Build";
  if (label.includes("audit") || label.includes("approval") || label.includes("handoff")) return "Operations";
  return "Work";
}

function groupNavigation(items: RuntimeNavigationItem[]) {
  const order = ["Home", "Work", "Build", "Operations", "Administration", "Account"];
  const groups = new Map<string, RuntimeNavigationItem[]>();
  for (const item of items) {
    const group = navigationGroup(item);
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return order
    .map((label) => ({ label, items: (groups.get(label) ?? []).sort((left, right) => left.displayOrder - right.displayOrder || left.label.localeCompare(right.label)) }))
    .filter((group) => group.items.length > 0);
}

function pageSubtitle(selected: RuntimeNavigationItem | null, bootstrap: ShellBootstrap) {
  if (!selected) return "This page is not available for your current access.";
  if (selected.id === "platform.home") return `${bootstrap.currentWorkspace.name} overview and quick actions.`;
  if (selected.id === "platform.workspaces") return "Choose the workspace you want to operate in.";
  if (selected.id === "platform.account") return "Profile, security and account actions.";
  if (selected.id === "platform.approvals") return "Review sensitive runtime actions before they continue.";
  if (selected.id === "platform.settings") return "Manage workspace configuration, access and interface.";
  if (selected.source === "manual") return "Workspace page created from the interface editor.";
  if (selected.source === "plugin") return "Plugin experience provided by the active workspace runtime.";
  return "Workspace page.";
}

function sourceLabel(source: RuntimeNavigationItem["source"]) {
  if (source === "platform") return "Platform";
  if (source === "plugin") return "Plugin";
  return "Manual";
}

function accessLabel(item: RuntimeNavigationItem) {
  if (!item.requiredPermission) return "Workspace member";
  return item.section === "administration" ? "Administrator access" : "Restricted access";
}

function DashboardPage({ bootstrap, onOpenPath }: { bootstrap: ShellBootstrap; onOpenPath: (path: string) => void }) {
  const role = bootstrap.currentWorkspace.roles[0]?.name ?? "Member";
  const account = bootstrap.navigation.find((item) => item.id === "platform.account");
  const workspaces = bootstrap.navigation.find((item) => item.id === "platform.workspaces");
  const settings = bootstrap.navigation.find((item) => item.id === "platform.settings");
  const approvals = bootstrap.navigation.find((item) => item.id === "platform.approvals");
  const pluginPages = bootstrap.navigation.filter((item) => item.source === "plugin");
  const manualPages = bootstrap.navigation.filter((item) => item.source === "manual");
  return <div className="page-stack">
    <SurfaceCard>
      <div className="surface-header">
        <div><small>Home</small><h2>Welcome, {displayUser(bootstrap.session)}</h2><p>{bootstrap.currentWorkspace.name} · {role}</p></div>
        <Badge>{bootstrap.currentWorkspace.status}</Badge>
      </div>
      <div className="actions">
        {workspaces ? <Button onClick={() => onOpenPath(workspaces.path)}>Switch workspace</Button> : null}
        {account ? <Button onClick={() => onOpenPath(account.path)}>My Account</Button> : null}
        {settings ? <Button className="primary" onClick={() => onOpenPath(settings.path)}>Settings</Button> : null}
        {approvals ? <Button onClick={() => onOpenPath(approvals.path)}>Approvals</Button> : null}
      </div>
    </SurfaceCard>
    <div className="metric-grid">
      <SurfaceCard><small>Workspace</small><h2>{bootstrap.currentWorkspace.name}</h2><p>Active workspace context</p></SurfaceCard>
      <SurfaceCard><small>Access</small><h2>{role}</h2><p>{bootstrap.membership.permissions.length} permitted action{bootstrap.membership.permissions.length === 1 ? "" : "s"}</p></SurfaceCard>
      <SurfaceCard><small>Runtime UI</small><h2>{pluginPages.length}</h2><p>Plugin page{pluginPages.length === 1 ? "" : "s"} available</p></SurfaceCard>
    </div>
    <SurfaceCard>
      <div className="surface-header"><div><small>Available modules</small><h2>Workspace navigation</h2><p>Everything shown here is active for your role and workspace.</p></div><Badge>{bootstrap.navigation.length}</Badge></div>
      <div className="quick-link-grid">
        {[...pluginPages, ...manualPages].slice(0, 8).map((item) => <button type="button" key={item.id} className="quick-link" onClick={() => onOpenPath(item.path)}>
          <strong>{item.label}</strong>
          <span>{sourceLabel(item.source)} · {accessLabel(item)}</span>
        </button>)}
        {pluginPages.length + manualPages.length === 0 ? <p>No additional workspace modules are active yet. Install or activate modules from Marketplace when you are ready.</p> : null}
      </div>
    </SurfaceCard>
  </div>;
}

function WorkspacesPage({ bootstrap, onSwitchWorkspace }: { bootstrap: ShellBootstrap; onSwitchWorkspace: (workspaceId: string) => void }) {
  return <SurfaceCard>
    <div className="surface-header"><div><small>workspaces</small><h2>Workspaces</h2><p>Choose the workspace you want to use.</p></div><Badge>{bootstrap.workspaces.length}</Badge></div>
    <div className="template-table-wrap domain-table">
      <table>
        <thead><tr><th>Workspace</th><th>Status</th><th>Role</th><th>Action</th></tr></thead>
        <tbody>{bootstrap.workspaces.map((workspace) => <tr key={workspace.id}>
          <td><strong>{workspace.name}</strong><small>{workspace.id === bootstrap.currentWorkspace.id ? "Current workspace" : "Available workspace"}</small></td>
          <td><Badge>{workspace.status}</Badge></td>
          <td>{workspace.roles.map((role) => role.name).join(", ") || "Member"}</td>
          <td><Button disabled={workspace.id === bootstrap.currentWorkspace.id} onClick={() => onSwitchWorkspace(workspace.id)}>{workspace.id === bootstrap.currentWorkspace.id ? "Current" : "Open"}</Button></td>
        </tr>)}</tbody>
      </table>
    </div>
  </SurfaceCard>;
}

function WorkspaceLoadingShell({ unavailable = false }: { unavailable?: boolean }) {
  if (unavailable) return <main className="login-page"><SurfaceCard className="login-panel"><div className="surface-header"><div><small>workspace</small><h2>Workspace unavailable</h2></div><Badge>offline</Badge></div><p className="login-status">The workspace could not be loaded. Check the Core service and retry.</p></SurfaceCard></main>;
  return <div className="app-shell" aria-busy="true" aria-label="Loading workspace">
    <header className="topbar"><span className="brand"><strong>v2</strong><Badge>runtime</Badge></span><span className="search">Loading workspace...</span></header>
    <aside className="sidebar"><div className="sidebar-label">WORKSPACE</div><p className="message">Loading...</p></aside>
    <main className="workspace"><div className="workspace-header"><div><h1>Workspace</h1><p>Loading your workspace...</p></div></div></main>
  </div>;
}

function NotFoundPage() {
  return <SurfaceCard><small>navigation</small><h2>Page unavailable</h2><p>This page is not active for your workspace or your current access level.</p></SurfaceCard>;
}

export function App() {
  if (window.location.pathname === "/setup/owner") return <OwnerSetupPage />;
  if (window.location.pathname === "/login") return <LoginPage />;
  if (window.location.pathname.startsWith("/public/")) return <PublicPage />;

  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [bootstrap, setBootstrap] = useState<ShellBootstrap | null>(null);
  const [session, setSession] = useState<CoreSession | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationContext | null>(null);
  const [activePath, setActivePath] = useState(window.location.pathname || "/");
  const [shell, setShell] = useState<ShellState>(emptyShell);
  const [notice, setNotice] = useState("runtime ready");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [runtimePage, setRuntimePage] = useState<Awaited<ReturnType<typeof loadRuntimePage>> | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const emit = (item: Notification) => setNotifications((current) => [...current, item].slice(-5));
  const dismiss = (id: string) => setNotifications((current) => current.filter((item) => item.id !== id));

  useEffect(() => {
    void loadStartupBootstrap().then((loaded) => {
      if (!loaded) {
        setSession(null);
        setAuthStatus("anonymous");
        return;
      }
      setBootstrap(loaded);
      setSession(loaded.session);
      setShell(shellFromBootstrap(loaded));
      setAuthStatus("authenticated");
      if (loaded.session.impersonated) void loadCurrentImpersonation().then(setImpersonation).catch(() => setImpersonation(null));
    }).catch((error) => {
      if (isCoreAuthRequiredError(error)) {
        setAuthStatus("anonymous");
        return;
      }
      setAuthStatus("unavailable");
      setNotice("core offline");
    });
  }, []);

  useEffect(() => {
    const onPop = () => setActivePath(window.location.pathname || "/");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigation = useMemo(() => [...(bootstrap?.navigation ?? [])].sort((left, right) => left.displayOrder - right.displayOrder || left.label.localeCompare(right.label)), [bootstrap?.navigation]);
  const selected = navigation.find((item) => item.path === activePath) ?? navigation.find((item) => item.path === "/" && activePath === "") ?? null;
  const navigationGroups = useMemo(() => groupNavigation(navigation), [navigation]);
  const commandResults = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return navigation.slice(0, 12);
    return navigation.filter((item) => `${item.label} ${sourceLabel(item.source)} ${accessLabel(item)}`.toLowerCase().includes(query)).slice(0, 12);
  }, [commandQuery, navigation]);
  const accountPath = navigation.find((item) => item.id === "platform.account")?.path;
  const settingsPath = navigation.find((item) => item.id === "platform.settings")?.path;

  useEffect(() => {
    let alive = true;
    setRuntimePage(null);
    if (!selected || selected.rendererMode !== "declarative") return () => { alive = false; };
    void loadRuntimePage(selected.id).then((page) => {
      if (alive) setRuntimePage(page);
    }).catch((error) => {
      if (alive) setNotice(error instanceof Error ? error.message : "Page unavailable");
    });
    return () => { alive = false; };
  }, [selected?.id, selected?.rendererMode]);

  const openPath = (path: string) => {
    setMobileSidebarOpen(false);
    setCommandOpen(false);
    setActivePath(path);
    window.history.pushState(null, "", path);
  };

  const switchWorkspace = (workspaceId: string) => {
    setCurrentWorkspaceId(workspaceId);
    const url = new URL(window.location.href);
    url.searchParams.set("workspace", workspaceId);
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  };

  const signOut = async () => {
    try {
      await signOutAuth();
      invalidateApiCaches();
      setSession(null);
      setImpersonation(null);
      setBootstrap(null);
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

  if (authStatus === "checking") return <WorkspaceLoadingShell />;
  if (authStatus === "anonymous") return <LoginPage redirectTo={protectedRedirectTarget()} />;
  if (authStatus === "unavailable" || !bootstrap) return <WorkspaceLoadingShell unavailable />;

  const title = selected?.label ?? "Page unavailable";
  const subtitle = pageSubtitle(selected, bootstrap);

  const platformNativePages: Record<string, () => JSX.Element> = {
    "platform.home": () => <DashboardPage bootstrap={bootstrap} onOpenPath={openPath} />,
    "platform.workspaces": () => <WorkspacesPage bootstrap={bootstrap} onSwitchWorkspace={switchWorkspace} />,
    "platform.account": () => <AccountPage session={session} bootstrap={bootstrap} onSessionChanged={setSession} onSignOut={() => void signOut()} onSwitchWorkspace={switchWorkspace} {...(settingsPath ? { onOpenSettings: () => openPath(settingsPath) } : {})} />,
    "platform.approvals": () => <ApprovalsPanel onDecision={() => emit(notification("success", "Approval updated", "The runtime approval queue was updated."))} />,
    "platform.settings": () => <SettingsPage shell={shell} onShellChange={setShell} emit={emit} onRuntimeChanged={() => undefined} />,
  };
  const renderSelected = () => {
    if (!selected) return <NotFoundPage />;
    if (selected.rendererMode === "native" && platformNativePages[selected.componentId ?? selected.id]) return platformNativePages[selected.componentId ?? selected.id]!();
    if (selected.rendererMode === "declarative" && runtimePage) return <TemplateRenderer page={runtimePage.page} runtime={{ contributionId: selected.id }} />;
    if (selected.rendererMode === "declarative") return <SurfaceCard><small>{selected.source}</small><h2>{selected.label}</h2><p>Loading page...</p></SurfaceCard>;
    return <NotFoundPage />;
  };

  return <>
    {impersonation ? <div className="impersonation-banner" role="status">
      <strong>Impersonating {session?.user?.email ?? impersonation.subjectUserId}</strong>
      <span>{impersonation.reason}</span>
      <Button onClick={() => void stopImpersonating()}>Stop impersonation</Button>
    </div> : null}
    <div className={`app-shell ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`} style={impersonation ? { paddingTop: "3.25rem" } : undefined}>
      <header className="topbar">
        <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={() => setMobileSidebarOpen((value) => !value)}>☰</button>
        <button className="brand" type="button" onClick={() => openPath(navigation[0]?.path ?? "/")}><strong>v2</strong><Badge>runtime</Badge></button>
        <button className="search" type="button" onClick={() => setCommandOpen(true)}>
          <span>{title}</span>
          <kbd>⌘K</kbd>
        </button>
        <WorkspaceSwitcher workspaces={bootstrap.workspaces} workspaceId={bootstrap.currentWorkspace.id} onChange={switchWorkspace} />
        <UserMenu session={session} workspace={bootstrap.currentWorkspace} {...(accountPath ? { accountPath } : {})} {...(settingsPath ? { settingsPath } : {})} onOpenPath={openPath} onSignOut={() => void signOut()} />
      </header>
      <aside className="sidebar">
        <div className="sidebar-brand-block">
          <span className="brand-mark">v2</span>
          <div><strong>{bootstrap.currentWorkspace.name}</strong><small>{bootstrap.currentWorkspace.status}</small></div>
        </div>
        {navigationGroups.map((group) => <section className="sidebar-section" key={group.label}>
          <div className="sidebar-label">{group.label}</div>
          {group.items.map((item) => <button key={item.id} className={selected?.id === item.id ? "nav active" : "nav"} onClick={() => openPath(item.path)}>
            <span>{item.label}</span>
            {item.source !== "platform" ? <small>{sourceLabel(item.source)}</small> : null}
          </button>)}
        </section>)}
        <div className="sidebar-account"><span className="avatar">{userInitial(session)}</span><div><strong>{displayUser(session)}</strong><small>{bootstrap.currentWorkspace.name}</small></div></div>
      </aside>
      <main className="workspace">
        <div className="workspace-header">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
            <div className="header-meta"><Badge>{bootstrap.currentWorkspace.name}</Badge>{selected ? <Badge>{accessLabel(selected)}</Badge> : null}</div>
          </div>
          <div className="header-actions"><Badge>{bootstrap.currentWorkspace.status}</Badge><Button onClick={persistLayout}>Save layout</Button></div>
        </div>
        {renderSelected()}
      </main>
      <aside className="assistant"><div className="assistant-empty"><strong>Workspace assistant</strong><p>Floating and secondary contributions appear here when an active module provides them.</p></div></aside>
      <footer className="statusbar"><span>{notice}</span><span>{navigation.length} visible item{navigation.length === 1 ? "" : "s"}</span><span>{bootstrap.currentWorkspace.name}</span></footer>
    </div>
    {mobileSidebarOpen ? <button className="mobile-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileSidebarOpen(false)} /> : null}
    {commandOpen ? <div className="palette-backdrop" onClick={() => setCommandOpen(false)}>
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        <input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.currentTarget.value)} placeholder="Search pages and workspace actions..." />
        <div className="palette-list">
          {commandResults.length ? commandResults.map((item) => <button className="palette-item" key={item.id} onClick={() => openPath(item.path)}>
            <div><strong>{item.label}</strong><small>{sourceLabel(item.source)} · {accessLabel(item)}</small></div>
            <Badge>{navigationGroup(item)}</Badge>
          </button>) : <div className="empty-state-inline">No matching pages available for your access.</div>}
        </div>
      </div>
    </div> : null}
    <NotificationCenter notifications={notifications} onDismiss={dismiss} />
  </>;
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
      window.location.assign(`/settings?workspace=${encodeURIComponent(result.workspaceId)}`);
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
      setStatus("Owner account created. Opening workspace...");
      window.location.assign(`/?workspace=${encodeURIComponent(setup.workspaceId)}`);
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
      setStatus("Owner activated. Opening workspace...");
      window.location.assign(`/?workspace=${encodeURIComponent(setup.workspaceId)}`);
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
      {setup ? <div className="settings-subpanel"><p>Workspace: {setup.workspaceId}</p><p>Owner email: {setup.ownerEmail}</p><p>Expires: {new Date(setup.expiresAt).toLocaleString()}</p></div> : null}
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
      <div className="actions"><Button className="primary" disabled={!canConsume} onClick={() => void consume()}>Activate owner access</Button></div>
    </SurfaceCard>
  </main>;
}
