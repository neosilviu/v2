import { useEffect, useMemo, useState, type FormEvent } from "react";
import { notification } from "@v2/feedback-runtime";
import type { Notification } from "@v2/rpc-contracts";
import { declarativePageContributionSchema, type ActionDefinition, type DeclarativePageContribution } from "@v2/ui-schema";
import { Badge, Button, NotificationCenter, SurfaceCard } from "@v2/ui-kit";
import type { ShellState } from "@v2/ui-runtime";
import { currentWorkspaceId, invalidateApiCaches, isCoreAuthRequiredError, loadCurrentImpersonation, loadRuntimePage, loadStartupBootstrap, saveLayout, setCurrentWorkspaceId, stopCurrentImpersonation, type CoreSession, type ImpersonationContext, type RuntimeNavigationItem, type ShellBootstrap, type WorkspaceSummary } from "./api";
import { signOutAuth, updateAuthProfile } from "./auth-api";
import { LoginPage } from "./LoginPage";
import { SettingsPage } from "./SettingsPage";
import { emptyShell, composeShellFromSurfaces } from "./shell";
import { TemplateRenderer } from "./platform/TemplateRenderer";
import { RuntimeSurfaceZone } from "./platform/RuntimeSurfaceZone";
import { loadRuntimeSurfaces } from "./platform/runtime-ui";

type AuthStatus = "checking" | "authenticated" | "anonymous" | "unavailable";

function displayUser(session: CoreSession | null) {
  return session?.user?.name?.trim() || session?.user?.email || "Workspace user";
}

function userInitial(session: CoreSession | null) {
  return displayUser(session).slice(0, 1).toUpperCase() || "W";
}

function schema(value: Parameters<typeof declarativePageContributionSchema.parse>[0]): DeclarativePageContribution {
  return declarativePageContributionSchema.parse(value);
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
    id: selected.id, title: selected.label, templateId: "admin.form", access: "private",
    fields: [{ id: "name", label: "Display name", type: "text", required: true }, { id: "email", label: "Email", type: "email", readOnly: true }],
    data: { name: session?.user?.name ?? "", email: session?.user?.email ?? "" },
    actions: [{ id: "platform.account.save", title: "Save profile", commandId: "platform.account.save", intent: "submit", variant: "primary" }],
    slots: [{ id: "platform.account.header", slot: "header", blocks: [{ type: "text", text: "Profile fields are rendered from the platform page schema.", tone: "muted" }] }],
  });
  return schema({ id: selected.id, title: selected.label, templateId: "admin.detail", access: "private", slots: [{ id: `${selected.id}.header`, slot: "header", blocks: [{ type: "text", text: "This platform contribution is awaiting a runtime schema.", tone: "muted" }] }] });
}

function loading(unavailable = false) {
  return <main className="login-page"><SurfaceCard className="login-panel"><h2>{unavailable ? "Workspace unavailable" : "Loading workspace..."}</h2><p className="login-status">{unavailable ? "The Core service could not load this workspace." : "Resolving runtime interface contributions."}</p></SurfaceCard></main>;
}

export function GeneratedWorkspaceApp() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [bootstrap, setBootstrap] = useState<ShellBootstrap | null>(null);
  const [session, setSession] = useState<CoreSession | null>(null);
  const [impersonation, setImpersonation] = useState<ImpersonationContext | null>(null);
  const [activePath, setActivePath] = useState(window.location.pathname || "/");
  const [shell, setShell] = useState<ShellState>(emptyShell);
  const [notice, setNotice] = useState("runtime ready");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [runtimePage, setRuntimePage] = useState<DeclarativePageContribution | null>(null);
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

  useEffect(() => {
    let alive = true;
    setRuntimePage(null);
    if (!selected || !bootstrap || selected.id === "platform.settings") return () => { alive = false; };
    if (selected.source === "platform" && selected.rendererMode === "native") { setRuntimePage(platformPage(selected, bootstrap, session)); return () => { alive = false; }; }
    void loadRuntimePage(selected.id).then((result) => { if (alive) setRuntimePage(result.page); }).catch(() => { if (alive) setRuntimePage(platformPage(selected, bootstrap, session)); });
    return () => { alive = false; };
  }, [selected?.id, bootstrap, session]);

  const openPath = (path: string) => { setActivePath(path); window.history.pushState(null, "", path); };
  const switchWorkspace = (workspaceId: string) => { setCurrentWorkspaceId(workspaceId); const url = new URL(window.location.href); url.searchParams.set("workspace", workspaceId); window.location.assign(`${url.pathname}${url.search}${url.hash}`); };
  const signOut = async () => { await signOutAuth(); invalidateApiCaches(); setAuthStatus("anonymous"); window.history.replaceState(null, "", "/login"); };
  const persistLayout = async () => { try { await saveLayout(shell); setNotice(`layout saved: ${currentWorkspaceId()}`); emit(notification("success", "Layout saved", "Workspace layout was updated.")); } catch { setNotice("layout not saved"); } };
  const stopImpersonating = async () => { const result = await stopCurrentImpersonation(); setImpersonation(null); if (result.reauthenticationRequired) window.location.assign("/login"); else window.location.reload(); };
  const submitPage = async (page: DeclarativePageContribution, values: Record<string, FormDataEntryValue>) => {
    if (page.id === "platform.account") { await updateAuthProfile({ name: String(values.name ?? "") }); emit(notification("success", "Profile saved", "Your display name was updated.")); }
  };
  const actionPage = async (action: ActionDefinition) => { if (action.intent === "navigate") openPath(action.commandId); };

  if (authStatus === "checking") return loading();
  if (authStatus === "anonymous") return <LoginPage redirectTo={`${window.location.pathname}${window.location.search}${window.location.hash}`} />;
  if (authStatus === "unavailable" || !bootstrap) return loading(true);
  const userNavigation = navigation.filter((item) => item.section === "user");
  const adminNavigation = navigation.filter((item) => item.section === "administration");

  return <>
    {impersonation ? <div role="status" className="impersonation-bar"><strong>Impersonating {session?.user?.email ?? impersonation.subjectUserId}</strong><Button onClick={() => void stopImpersonating()}>Stop impersonation</Button></div> : null}
    <div className="app-shell">
      <header className="topbar"><button className="brand" type="button" onClick={() => openPath(navigation[0]?.path ?? "/")}><strong>v2</strong><Badge>generated runtime</Badge></button><span className="search">{selected?.label ?? "Workspace"}</span><label className="workspace-switcher"><small>Workspace</small><select value={bootstrap.currentWorkspace.id} onChange={(event) => switchWorkspace(event.currentTarget.value)}>{bootstrap.workspaces.map((workspace: WorkspaceSummary) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label><button className="user-button" type="button" onClick={() => void signOut()}><span className="avatar">{userInitial(session)}</span><span>{displayUser(session)}</span></button></header>
      <aside className="sidebar"><div className="sidebar-label">USER</div>{userNavigation.map((item) => <button key={item.id} className={selected?.id === item.id ? "nav active" : "nav"} onClick={() => openPath(item.path)}>{item.label}</button>)}{adminNavigation.length ? <div className="sidebar-label">ADMINISTRATION</div> : null}{adminNavigation.map((item) => <button key={item.id} className={selected?.id === item.id ? "nav active" : "nav"} onClick={() => openPath(item.path)}>{item.label}</button>)}</aside>
      <main className="workspace"><div className="workspace-header"><div><h1>{selected?.label ?? "Workspace"}</h1><p>{selected ? `${selected.source} generated page` : "Page unavailable"}</p></div><div className="header-actions"><Badge>{bootstrap.currentWorkspace.status}</Badge><Button onClick={() => void persistLayout()}>Save layout</Button></div></div>{selected?.id === "platform.settings" ? <SettingsPage shell={shell} onShellChange={setShell} emit={emit} onRuntimeChanged={(_, __, nextShell) => setShell(nextShell)} /> : runtimePage ? <TemplateRenderer page={runtimePage} runtime={{ contributionId: selected?.id }} callbacks={{ onSubmit: submitPage, onAction: actionPage }} /> : <SurfaceCard><p className="message">Loading generated page...</p></SurfaceCard>}</main>
      <aside className="assistant"><RuntimeSurfaceZone surfaces={shell.surfaces} zoneId="assistant.right" emptyMessage="No active assistant panel contribution." /></aside>
      <footer className="statusbar"><span>{notice}</span><span>{navigation.length} navigation items</span><span>Core {bootstrap.currentWorkspace.id}</span></footer>
    </div>
    <NotificationCenter notifications={notifications} onDismiss={(id) => setNotifications((current) => current.filter((item) => item.id !== id))} />
  </>;
}
