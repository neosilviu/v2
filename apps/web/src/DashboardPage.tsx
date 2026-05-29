import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import type { CoreSession, RuntimeNavigationItem, ShellBootstrap } from "./api";

function displayUser(session: CoreSession | null) {
  return session?.user?.name?.trim() || session?.user?.email || "Workspace user";
}

function sourceLabel(source: RuntimeNavigationItem["source"]) {
  return source === "plugin" ? "Application" : source === "manual" ? "Custom page" : "Platform";
}

function navigationIcon(item: RuntimeNavigationItem) {
  const value = `${item.id} ${item.label}`.toLowerCase();
  if (value.includes("setting") || value.includes("interface")) return "⚙";
  if (value.includes("approval") || value.includes("audit")) return "✓";
  if (value.includes("account") || value.includes("profile")) return "◉";
  if (value.includes("workspace")) return "▣";
  if (value.includes("website")) return "◎";
  if (value.includes("commerce")) return "▤";
  if (value.includes("agent") || value.includes("chat")) return "✦";
  return "•";
}

function pageSummary(item: RuntimeNavigationItem) {
  if (item.id === "platform.settings") return "Configuration and workspace interface.";
  if (item.id === "platform.approvals") return "Sensitive actions awaiting review.";
  if (item.id === "platform.workspaces") return "Change your active workspace.";
  if (item.id === "platform.account") return "Profile and account details.";
  return item.source === "plugin" ? "Active workspace application." : "Published workspace page.";
}

type DashboardPageProps = {
  bootstrap: ShellBootstrap;
  session: CoreSession | null;
  navigation: RuntimeNavigationItem[];
  assistantCount: number;
  onOpenPath: (path: string) => void;
};

export function DashboardPage({ bootstrap, session, navigation, assistantCount, onOpenPath }: DashboardPageProps) {
  const role = bootstrap.currentWorkspace.roles[0]?.name ?? "Member";
  const modules = navigation.filter((item) => item.source !== "platform");
  const settings = navigation.find((item) => item.id === "platform.settings");
  const shortcuts = navigation.filter((item) => ["platform.settings", "platform.approvals", "platform.workspaces", "platform.account"].includes(item.id));

  return <div className="dashboard-page">
    <SurfaceCard className="dashboard-hero">
      <div className="dashboard-hero-copy">
        <p className="eyebrow">Workspace overview</p>
        <h2>Welcome, {displayUser(session)}</h2>
        <p><strong>{bootstrap.currentWorkspace.name}</strong> is ready. Your active role is <strong>{role}</strong>.</p>
      </div>
      <div className="actions">
        {settings ? <Button className="primary" onClick={() => onOpenPath(settings.path)}>Open settings</Button> : null}
        {modules[0] ? <Button onClick={() => onOpenPath(modules[0]!.path)}>Open application</Button> : null}
      </div>
    </SurfaceCard>

    <div className="metric-grid">
      <SurfaceCard className="metric-card"><small>Workspace</small><strong>{bootstrap.currentWorkspace.name}</strong><p>{bootstrap.currentWorkspace.status}</p></SurfaceCard>
      <SurfaceCard className="metric-card"><small>Your access</small><strong>{role}</strong><p>{bootstrap.membership.permissions.length} permitted actions</p></SurfaceCard>
      <SurfaceCard className="metric-card"><small>Applications</small><strong>{modules.length}</strong><p>Runtime modules available</p></SurfaceCard>
      <SurfaceCard className="metric-card"><small>Assistant</small><strong>{assistantCount ? "Available" : "Not active"}</strong><p>{assistantCount ? `${assistantCount} mounted panel${assistantCount === 1 ? "" : "s"}` : "No panel published"}</p></SurfaceCard>
    </div>

    <div className="dashboard-columns">
      <SurfaceCard className="dashboard-section">
        <div className="surface-header"><div><small>Applications</small><h2>Active modules</h2><p>Features available for this workspace.</p></div><Badge>{modules.length}</Badge></div>
        <div className="module-grid">
          {modules.length ? modules.map((item) => <button className="module-card" type="button" key={item.id} onClick={() => onOpenPath(item.path)}>
            <span className="module-icon">{navigationIcon(item)}</span>
            <strong>{item.label}</strong>
            <small>{sourceLabel(item.source)}</small>
            <p>{pageSummary(item)}</p>
          </button>) : <div className="empty-state"><strong>No active modules yet</strong><p>Use Marketplace in Settings to install workspace applications.</p></div>}
        </div>
      </SurfaceCard>

      <SurfaceCard className="dashboard-section dashboard-shortcuts">
        <div className="surface-header"><div><small>Manage</small><h2>Quick actions</h2></div></div>
        <div className="shortcut-list">{shortcuts.map((item) => <button type="button" key={item.id} onClick={() => onOpenPath(item.path)}>
          <span className="module-icon compact">{navigationIcon(item)}</span>
          <span><strong>{item.label}</strong><small>{pageSummary(item)}</small></span>
          <b>→</b>
        </button>)}</div>
      </SurfaceCard>
    </div>
  </div>;
}
