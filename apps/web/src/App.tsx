import { useEffect, useMemo, useState, type FormEvent } from "react";
import { notification } from "@v2/feedback-runtime";
import type { Notification } from "@v2/rpc-contracts";
import { Badge, Button, NotificationCenter, SurfaceCard } from "@v2/ui-kit";
import type { ShellState } from "@v2/ui-runtime";
import { consumeOwnerSetup, currentWorkspaceId, invalidateApiCaches, isCoreAuthRequiredError, loadCoreSession, loadCurrentImpersonation, loadOwnerSetup, loadRuntimePage, loadStartupBootstrap, saveLayout, setCurrentWorkspaceId, stopCurrentImpersonation, type CoreSession, type ImpersonationContext, type RuntimeNavigationItem, type ShellBootstrap, type WorkspaceSummary } from "./api";
import { AuthRequestError, ownerSetupSignUp, signInEmail, signOutAuth, updateAuthProfile } from "./auth-api";
import { emptyShell } from "./shell";
import { ApprovalsPanel } from "./platform/ApprovalsPanel";
import { TemplateRenderer } from "./platform/TemplateRenderer";
import { LoginPage } from "./LoginPage";
import { PublicPage } from "./PublicPage";
import { SettingsPage } from "./SettingsPage";

type AuthStatus = "checking" | "authenticated" | "anonymous" | "unavailable";

function protectedRedirectTarget() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function displayUser(session: CoreSession | null) {
  const user = session?.user;
  return user?.name?.trim() || user?.email || "Workspace user";
}

function userInitial(session: CoreSession | null) {
  return displayUser(session).slice(0, 1).toUpperCase() || "W";
}

function shellFromBootstrap(bootstrap: ShellBootstrap): ShellState {
  if (!bootstrap.layout) return emptyShell;
  return { ...emptyShell, zones: bootstrap.layout.zones, placements: bootstrap.layout.placements };
}

function UserMenu({ session, workspace, accountPath, settingsPath, onOpenPath, onSignOut }: { session: CoreSession | null; workspace: WorkspaceSummary | null; accountPath?: string; settingsPath?: string; onOpenPath: (path: string) => void; onSignOut: () => void }) {
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
      {accountPath ? <button type="button" onClick={() => closeAndRun(() => onOpenPath(accountPath))}>My Account</button> : null}
      {settingsPath ? <button type="button" onClick={() => closeAndRun(() => onOpenPath(settingsPath))}>Settings</button> : null}
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

function DashboardPage({ bootstrap, onOpenPath }: { bootstrap: ShellBootstrap; onOpenPath: (path: string) => void }) {
  const role = bootstrap.currentWorkspace.roles[0]?.name ?? "Member";
  const account = bootstrap.navigation.find((item) => item.id === "platform.account");
  const workspaces = bootstrap.navigation.find((item) => item.id === "platform.workspaces");
  const settings = bootstrap.navigation.find((item) => item.id === "platform.settings");
  return <div className="page-stack">
    <SurfaceCard>
      <div className="surface-header">
        <div><small>home</small><h2>Welcome, {displayUser(bootstrap.session)}</h2><p>{bootstrap.currentWorkspace.name} · {role}</p></div>
        <Badge>{bootstrap.currentWorkspace.status}</Badge>
      </div>
      <div className="actions">
        {workspaces ? <Button onClick={() => onOpenPath(workspaces.path)}>Switch workspace</Button> : null}
        {account ? <Button onClick={() => onOpenPath(account.path)}>My Account</Button> : null}
        {settings ? <Button className="primary" onClick={() => onOpenPath(settings.path)}>Settings</Button> : null}
      </div>
    </SurfaceCard>
    <div className="metric-grid">
      <SurfaceCard><small>workspace</small><h2>{bootstrap.currentWorkspace.name}</h2><p>Active workspace context</p></SurfaceCard>
      <SurfaceCard><small>role</small><h2>{role}</h2><p>{bootstrap.membership.permissions.length} permitted actions</p></SurfaceCard>
      <SurfaceCard><small>access</small><h2>{bootstrap.workspaces.length}</h2><p>Workspace{bootstrap.workspaces.length === 1 ? "" : "s"} available</p></SurfaceCard>
    </div>
  </div>;
}

function WorkspacesPage({ bootstrap, onSwitchWorkspace }: { bootstrap: ShellBootstrap; onSwitchWorkspace: (workspaceId: string) => void }) {
  return <SurfaceCard>
    <div className="surface-header"><div><small>workspaces</small><h2>Workspaces</h2><p>Choose the workspace you want to use.</p></div><Badge>{bootstrap.workspaces.length}</Badge></div>
    <div className="template-table-wrap domain-table">
      <table>
        <thead><tr><th>Workspace</th><th>Status</th><th>Role</th><th>Action</th></tr></thead>
        <tbody>{bootstrap.workspaces.map((workspace) => <tr key={workspace.id}>
          <td><strong>{workspace.name}</strong><small>{workspace.id}</small></td>
          <td><Badge>{workspace.status}</Badge></td>
          <td>{workspace.roles.map((role) => role.name).join(", ") || "Member"}</td>
          <td><Button disabled={workspace.id === bootstrap.currentWorkspace.id} onClick={() => onSwitchWorkspace(workspace.id)}>{workspace.id === bootstrap.currentWorkspace.id ? "Current" : "Open"}</Button></td>
        </tr>)}</tbody>
      </table>
    </div>
  </SurfaceCard>;
}

function MyAccountPage({ session, bootstrap, onSessionChanged, onSignOut }: { session: CoreSession | null; bootstrap: ShellBootstrap; onSessionChanged: (session: CoreSession) => void; onSignOut: () => void }) {
  const [name, setName] = useState(session?.user?.name ?? "");
  const [status, setStatus] = useState("Account ready");
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(session?.user?.name ?? ""), [session?.user?.name]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateAuthProfile({ name });
      onSessionChanged(await loadCoreSession());
      setStatus("Profile saved");
    } catch {
      setStatus("Profile could not be saved");
    } finally {
      setSaving(false);
    }
  };
  return <div className="page-stack">
    <SurfaceCard>
      <div className="surface-header"><div><small>account</small><h2>My Account</h2><p>{status}</p></div><Badge>{session?.isAdmin ? "admin" : "member"}</Badge></div>
      <form className="profile-form" onSubmit={submit}>
        <label className="field">Display name<input value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="Your name" /></label>
        <div className="actions"><Button className="primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</Button><Button type="button" onClick={onSignOut}>Sign out</Button></div>
      </form>
    </SurfaceCard>
    <div className="settings-grid">
      <section className="settings-subpanel"><h3>Email</h3><p>{session?.user?.email ?? "unknown"}</p></section>
      <section className="settings-subpanel"><h3>Workspace access</h3><p>{bootstrap.currentWorkspace.name}</p><p>{bootstrap.currentWorkspace.roles.map((role) => role.name).join(", ") || "Member"}</p></section>
      <section className="settings-subpanel"><h3>Passkeys</h3><p>Manage passkeys from Security settings when enabled by your workspace.</p></section>
      <section className="settings-subpanel"><h3>Active sessions</h3><p>Current browser session is active.</p></section>
    </div>
  </div>;
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

  const navigation = useMemo(() => [...(bootstrap?.navigation ?? [])].sort((left, right) => left.displayOrder - right.displayOrder), [bootstrap?.navigation]);
  const selected = navigation.find((item) => item.path === activePath) ?? navigation.find((item) => item.path === "/" && activePath === "") ?? null;
  const userNavigation = navigation.filter((item) => item.section === "user");
  const adminNavigation = navigation.filter((item) => item.section === "administration");
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
  const subtitle = selected ? `${selected.source} ${selected.rendererMode} page` : "This workspace page is not visible to your account";

  const platformNativePages: Record<string, () => JSX.Element> = {
    "platform.home": () => <DashboardPage bootstrap={bootstrap} onOpenPath={openPath} />,
    "platform.workspaces": () => <WorkspacesPage bootstrap={bootstrap} onSwitchWorkspace={switchWorkspace} />,
    "platform.account": () => <MyAccountPage session={session} bootstrap={bootstrap} onSessionChanged={setSession} onSignOut={() => void signOut()} />,
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
    {impersonation ? <div role="status" style={{ position: "fixed", inset: "0 0 auto 0", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "0.65rem 1rem", background: "#7c2d12", color: "#fff" }}>
      <strong>Impersonating {session?.user?.email ?? impersonation.subjectUserId}</strong>
      <span>{impersonation.reason}</span>
      <Button onClick={() => void stopImpersonating()}>Stop impersonation</Button>
    </div> : null}
    <div className="app-shell" style={impersonation ? { paddingTop: "3.25rem" } : undefined}>
      <header className="topbar">
        <button className="brand" type="button" onClick={() => openPath(navigation[0]?.path ?? "/")}><strong>v2</strong><Badge>runtime</Badge></button>
        <span className="search">{title}</span>
        <WorkspaceSwitcher workspaces={bootstrap.workspaces} workspaceId={bootstrap.currentWorkspace.id} onChange={switchWorkspace} />
        <UserMenu session={session} workspace={bootstrap.currentWorkspace} {...(accountPath ? { accountPath } : {})} {...(settingsPath ? { settingsPath } : {})} onOpenPath={openPath} onSignOut={() => void signOut()} />
      </header>
      <aside className="sidebar">
        <div className="sidebar-label">USER</div>
        {userNavigation.map((item) => <button key={item.id} className={selected?.id === item.id ? "nav active" : "nav"} onClick={() => openPath(item.path)}>{item.label}</button>)}
        {adminNavigation.length ? <div className="sidebar-label">ADMINISTRATION</div> : null}
        {adminNavigation.map((item) => <button key={item.id} className={selected?.id === item.id ? "nav active" : "nav"} onClick={() => openPath(item.path)}>{item.label}</button>)}
        <div className="sidebar-account"><span className="avatar">{userInitial(session)}</span><div><strong>{displayUser(session)}</strong><small>{bootstrap.currentWorkspace.name}</small></div></div>
      </aside>
      <main className="workspace">
        <div className="workspace-header">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
            <div className="header-meta"><Badge>{bootstrap.currentWorkspace.name}</Badge><Badge>{selected?.section ?? "none"}</Badge></div>
          </div>
          <div className="header-actions"><Badge>{bootstrap.currentWorkspace.status}</Badge><Button onClick={persistLayout}>Save layout</Button></div>
        </div>
        {renderSelected()}
      </main>
      <aside className="assistant"><div className="message">Secondary workspace area is ready for active panel contributions.</div></aside>
      <footer className="statusbar"><span>{notice}</span><span>{navigation.length} navigation items</span><span>Core {bootstrap.currentWorkspace.id}</span></footer>
    </div>
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
