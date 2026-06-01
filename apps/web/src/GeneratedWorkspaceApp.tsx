import { useEffect, useMemo, useState } from "react";
import { notification } from "@v2/feedback-runtime";
import type { Notification } from "@v2/rpc-contracts";
import { declarativePageContributionSchema, type DeclarativePageContribution } from "@v2/ui-schema";
import { Badge, Button, NotificationCenter, SurfaceCard } from "@v2/ui-kit";
import type { ShellState } from "@v2/ui-runtime";
import { invalidateApiCaches, isCoreAuthRequiredError, loadCurrentImpersonation, loadRuntimePage, loadStartupBootstrap, saveLayout, setCurrentWorkspaceId, stopCurrentImpersonation, type CoreSession, type ImpersonationContext, type RuntimeNavigationItem, type ShellBootstrap } from "./api";
import { signOutAuth } from "./auth-api";
import { LoginPage } from "./LoginPage";
import { SettingsPage } from "./SettingsPage";
import { emptyShell, composeShellFromSurfaces } from "./shell";
import { ApprovalsPanel } from "./platform/ApprovalsPanel";
import { TemplateRenderer } from "./platform/TemplateRenderer";
import { RuntimeSurfaceZone } from "./platform/RuntimeSurfaceZone";
import { loadRuntimeSurfaces } from "./platform/runtime-ui";
import { displayUser, userInitial, UserMenu, WorkspaceSwitcher } from "./platform/account-ui";

type AuthStatus = "checking" | "authenticated" | "anonymous" | "unavailable";

function schema(value: Parameters<typeof declarativePageContributionSchema.parse>[0]): DeclarativePageContribution {
  return declarativePageContributionSchema.parse(value);
}

function pageDescription(selected: RuntimeNavigationItem | null, workspaceName: string) {
  if (!selected) return "This page is unavailable for your current access.";
  if (selected.id === "platform.home") return `${workspaceName} overview and active workspace modules.`;
  if (selected.id === "platform.settings") return "Configure the workspace, access rules and published interface.";
  if (selected.id === "platform.approvals") return "Review sensitive actions before the runtime continues.";
  if (selected.id === "platform.account") return "Manage your profile and account details.";
  if (selected.id === "platform.workspaces") return "Choose the workspace you want to operate in.";
  return selected.source === "plugin" ? "Application page provided by an active workspace module." : "Workspace page.";
}

function navMark(item: RuntimeNavigationItem) {
  const normalized = `${item.id} ${item.label}`.toLowerCase();
  if (normalized.includes("home") || normalized.includes("dashboard")) return "⌂";
  if (normalized.includes("setting") || normalized.includes("interface")) return "⚙";
  if (normalized.includes("approval") || normalized.includes("audit")) return "✓";
  if (normalized.includes("account") || normalized.includes("profile")) return "◉";
  if (normalized.includes("workspace")) return "▣";
  return "•";
}

function platformPage(selected: RuntimeNavigationItem, bootstrap: ShellBootstrap, session: CoreSession | null): DeclarativePageContribution {
  const role = bootstrap.currentWorkspace.roles[0]?.name ?? "Member";
  if (selected.id === "platform.home") return schema({
    id: selected.id, title: selected.label, templateId: "admin.dashboard", access: "private",
    columns: [{ id: "metric", label: "Metric", field: "metric" }, { id: "value", label: "Value", field: "value" }, { id: "detail", label: "Detail", field: "detail" }],
    data: { rows: [
      { metric: "Workspace", value: bootstrap.currentWorkspace.name, detail: "Active workspace context" },
      { metric: "Role", value: role, detail: `${bootstrap.membership.permissions.length} permitted actions` },
      { metric: "Access", value: String(bootstrap.workspaces.length), detail: "Available workspaces" },
    ] },
    slots: [{ id: "platform.home.header", slot: "header", blocks: [{ type: "heading", text: `Welcome, ${displayUser(session)}`, level: "h2" }, { type: "text", text: `${bootstrap.currentWorkspace.name} · ${role}`, tone: "muted" }] }],
  });
  if (selected.id === "platform.workspaces") return schema({
    id: selected.id, title: selected.label, templateId: "admin.table", access: "private",
    columns: [{ id: "name", label: "Workspace", field: "name" }, { id: "status", label: "Status", field: "status", type: "badge" }, { id: "roles", label: "Role", field: "roles" }],
    data: { rows: bootstrap.workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, status: workspace.status, roles: workspace.roles.map((item) => item.name).join(", ") || "Member" })) },
    slots: [{ id: "platform.workspaces.header", slot: "header", blocks: [{ type: "text", text: "Workspace navigation is provided by the runtime shell selector.", tone: "muted" }] }],
  });
  if (selected.id === "platform.account") return schema({
    id: selected.id,
    title: selected.label,
    templateId: "account.profile",
    access: "private",
    actions: [
      { id: "platform.account.profile.save", title: "Save profile", commandId: "platform.account.profile.save", intent: "submit", variant: "primary", access: "private", risk: "safe", placement: "form", effects: [{ type: "refresh" }] },
      { id: "platform.account.sign-out", title: "Logout", commandId: "platform.account.sign-out", intent: "execute", variant: "danger", access: "private", risk: "safe", placement: "header", effects: [{ type: "navigate", to: "/login" }] },
    ],
    data: { profile: { name: session?.user?.name ?? null, email: session?.user?.email ?? null, emailVerified: Boolean(session?.user?.email), passkeys: 0, sessions: 1, isPlatformAdmin: Boolean(session?.isSuperadmin ?? session?.isAdmin) }, workspaces: bootstrap.workspaces, currentWorkspace: bootstrap.currentWorkspace },
  });
  return schema({ id: selected.id, title: selected.label, templateId: "admin.detail", access: "private", slots: [{ id: `${selected.id}.header`, slot: "header", blocks: [{ type: "text", text: "This platform contribution is rendered through the generic runtime outlet.", tone: "muted" }] }] });
}

function loading(unavailable = false) {
  return <main className="login-page"><SurfaceCard className="login-panel loading-panel"><div className="brand-lockup"><span className="brand-mark">v2</span><div><strong>Workspace</strong><small>Runtime platform</small></div></div><h2>{unavailable ? "Workspace unavailable" : "Loading workspace..."}</h2><p className="login-status">{unavailable ? "The Core service could not load this workspace." : "Resolving interface contributions."}</p></SurfaceCard></main>;
}

export function GeneratedWorkspaceApp() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [bootstrap, setBootstrap] = useState<ShellBootstrap | null>(null);
  const [session, setSession] = useState<CoreSession | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationContext | null>(null);
  const [activePath, setActivePath] = useState(window.location.pathname || "/");
  const [shell, setShell] = useState<ShellState>(emptyShell);
  const [notice, setNotice] = useState("Workspace ready");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [runtimePage, setRuntimePage] = useState<DeclarativePageContribution | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const emit = (item: Notification) => setNotifications((current) => [...current, item].slice(-5));

  useEffect(() => {
    void loadStartupBootstrap().then(async (loaded) => {
      if (!loaded) { setAuthStatus("anonymous"); return; }
      setBootstrap(loaded); setSession(loaded.session); setAuthStatus("authenticated");
      const surfaces = await loadRuntimeSurfaces(loaded.currentWorkspace.id).catch(() => []);
      const runtimeShell = composeShellFromSurfaces(surfaces);
      setShell(loaded.layout ? { ...runtimeShell, zones: loaded.layout.zones, placements: loaded.layout.placements } : runtimeShell);
      if (loaded.session.impersonated) void loadCurrentImpersonation().then(setImpersonation).catch(() => setImpersonation(null));
    }).catch((error) => { setAuthStatus(isCoreAuthRequiredError(error) ? "anonymous" : "unavailable"); });
  }, []);

  useEffect(() => { const pop = () => setActivePath(window.location.pathname || "/"); window.addEventListener("popstate", pop); return () => window.removeEventListener("popstate", pop); }, []);
  const navigation = useMemo(() => [...(bootstrap?.navigation ?? [])].sort((a, b) => a.displayOrder - b.displayOrder), [bootstrap?.navigation]);
  const selected = navigation.find((item) => item.path === activePath) ?? null;
  const accountPath = navigation.find((item) => item.id === "platform.account")?.path;
  const settingsPath = navigation.find((item) => item.id === "platform.settings")?.path;

  useEffect(() => {
    let alive = true;
    setRuntimePage(null);
    if (!selected || !bootstrap || selected.id === "platform.settings" || selected.id === "platform.approvals") return () => { alive = false; };
    if (selected.source === "platform" && selected.rendererMode === "native") { setRuntimePage(platformPage(selected, bootstrap, session)); return () => { alive = false; }; }
    void loadRuntimePage(selected.id).then((result) => { if (alive) setRuntimePage(result.page); }).catch(() => { if (alive) setRuntimePage(platformPage(selected, bootstrap, session)); });
    return () => { alive = false; };
  }, [selected?.id, bootstrap, session]);

  const openPath = (path: string) => { setMobileSidebarOpen(false); setActivePath(path); window.history.pushState(null, "", path); };
  const switchWorkspace = (workspaceId: string) => { setCurrentWorkspaceId(workspaceId); const url = new URL(window.location.href); url.searchParams.set("workspace", workspaceId); window.location.assign(`${url.pathname}${url.search}${url.hash}`); };
  const signOut = async () => { await signOutAuth(); invalidateApiCaches(); setAuthStatus("anonymous"); window.history.replaceState(null, "", "/login"); };
  const persistLayout = async () => { try { await saveLayout(shell); setNotice("Layout saved"); emit(notification("success", "Layout saved", "Workspace interface layout was updated.")); } catch { setNotice("Layout not saved"); emit(notification("error", "Layout not saved", "The workspace layout could not be updated.")); } };
  const stopImpersonating = async () => { const result = await stopCurrentImpersonation(); setImpersonation(null); if (result.reauthenticationRequired) window.location.assign("/login"); else window.location.reload(); };
  const redirectAfterLogin = window.location.pathname === "/login" ? null : `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (authStatus === "checking") return loading();
  if (authStatus === "anonymous") return redirectAfterLogin ? <LoginPage redirectTo={redirectAfterLogin} /> : <LoginPage />;
  if (authStatus === "unavailable" || !bootstrap) return loading(true);
  const userNavigation = navigation.filter((item) => item.section === "user");
  const adminNavigation = navigation.filter((item) => item.section === "administration");
  const assistantSurfaces = shell.surfaces.filter((surface) => surface.zone === "assistant.right");
  const pageOutput = selected?.id === "platform.settings"
    ? <SettingsPage shell={shell} onShellChange={setShell} emit={emit} onRuntimeChanged={(_, __, nextShell) => setShell(nextShell)} />
    : selected?.id === "platform.approvals"
      ? <ApprovalsPanel onDecision={() => emit(notification("success", "Approval updated", "The runtime approval queue was updated."))} />
      : selected && runtimePage
        ? <TemplateRenderer page={runtimePage} runtime={{ contributionId: selected.id }} />
        : <SurfaceCard><p className="message">Loading generated page...</p></SurfaceCard>;

  return <>
    {impersonation ? <div role="status" className="impersonation-bar"><strong>Impersonating {session?.user?.email ?? impersonation.subjectUserId}</strong><Button onClick={() => void stopImpersonating()}>Stop impersonation</Button></div> : null}
    <div className={`app-shell ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-inner">
          <button className="sidebar-brand" type="button" onClick={() => openPath(navigation[0]?.path ?? "/")}>
            <span className="brand-mark">v2</span>
            <span className="sidebar-brand-copy"><strong>{bootstrap.currentWorkspace.name}</strong><small>Runtime workspace</small></span>
          </button>
          <nav className="sidebar-nav" aria-label="Primary navigation">
            <section className="sidebar-section"><p className="sidebar-section-label">Workspace</p>{userNavigation.map((item) => <button key={item.id} className={selected?.id === item.id ? "nav-item nav-item-active" : "nav-item"} type="button" onClick={() => openPath(item.path)}><span className="nav-item-icon">{navMark(item)}</span><span className="nav-item-label">{item.label}</span></button>)}</section>
            {adminNavigation.length ? <section className="sidebar-section"><p className="sidebar-section-label">Administration</p>{adminNavigation.map((item) => <button key={item.id} className={selected?.id === item.id ? "nav-item nav-item-active" : "nav-item"} type="button" onClick={() => openPath(item.path)}><span className="nav-item-icon">{navMark(item)}</span><span className="nav-item-label">{item.label}</span></button>)}</section> : null}
          </nav>
          <div className="sidebar-foot"><span className="avatar">{userInitial(session)}</span><div><strong>{displayUser(session)}</strong><small>{bootstrap.currentWorkspace.roles.map((role) => role.name).join(", ") || "Member"}</small></div></div>
        </div>
      </aside>
      <div className="shell-content">
        <header className="topbar">
          <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={() => setMobileSidebarOpen((value) => !value)}>☰</button>
          <div className="topbar-title-copy"><strong>{selected?.label ?? "Workspace"}</strong><span>{pageDescription(selected, bootstrap.currentWorkspace.name)}</span></div>
          <div className="topbar-actions">
            {assistantSurfaces.length ? <button className="topbar-action" type="button" onClick={() => setAssistantOpen((value) => !value)}>Assistant</button> : null}
            <WorkspaceSwitcher workspaces={bootstrap.workspaces} workspaceId={bootstrap.currentWorkspace.id} onChange={switchWorkspace} />
            <UserMenu
              session={session}
              workspace={bootstrap.currentWorkspace}
              {...(accountPath ? { accountPath } : {})}
              {...(settingsPath ? { settingsPath } : {})}
              onOpenPath={openPath}
              onSignOut={() => void signOut()}
              secondaryAction={{ label: "Save layout", onClick: () => void persistLayout() }}
            />
          </div>
        </header>
        <main className="workspace"><div className="workspace-page-header"><div><p className="eyebrow">{selected?.source === "plugin" ? "Application" : "Workspace"}</p><h1>{selected?.label ?? "Workspace"}</h1><p>{pageDescription(selected, bootstrap.currentWorkspace.name)}</p></div><Badge>{bootstrap.currentWorkspace.status}</Badge></div>{pageOutput}</main>
        <footer className="statusbar"><span>{notice}</span><span>{navigation.length} visible pages</span><span>{bootstrap.currentWorkspace.name}</span></footer>
      </div>
      {assistantOpen && assistantSurfaces.length ? <aside className="assistant assistant-drawer"><div className="assistant-header"><strong>Workspace assistant</strong><button type="button" onClick={() => setAssistantOpen(false)} aria-label="Close assistant">×</button></div><RuntimeSurfaceZone surfaces={shell.surfaces} zoneId="assistant.right" /></aside> : null}
    </div>
    {mobileSidebarOpen ? <button className="mobile-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileSidebarOpen(false)} /> : null}
    <NotificationCenter notifications={notifications} onDismiss={(id) => setNotifications((current) => current.filter((item) => item.id !== id))} />
  </>;
}
