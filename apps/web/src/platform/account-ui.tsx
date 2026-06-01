import { useState } from "react";
import type { CoreSession, WorkspaceSummary } from "../api";
import { Badge, SurfaceCard } from "@v2/ui-kit";

export function displayUser(session: CoreSession | null) {
  const user = session?.user;
  return user?.name?.trim() || user?.email || "Workspace user";
}

export function userInitial(session: CoreSession | null) {
  return displayUser(session).slice(0, 1).toUpperCase() || "W";
}

export function accessLabel(session: CoreSession | null, workspace: WorkspaceSummary | null) {
  if (session?.isSuperadmin || session?.isAdmin) return "Superadmin";
  return workspace?.roles.map((role) => role.name).filter(Boolean).join(", ") || "Member";
}

export function WorkspaceSwitcher({ workspaces, workspaceId, onChange }: { workspaces: WorkspaceSummary[]; workspaceId: string; onChange: (workspaceId: string) => void }) {
  return <label className="workspace-switcher">
    <small>Workspace</small>
    {workspaces.length ? <select aria-label="Select workspace" value={workspaceId} onChange={(event) => onChange(event.currentTarget.value)}>
      {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.status}</option>)}
    </select> : <strong>No workspaces</strong>}
  </label>;
}

export function UserMenu({
  session,
  workspace,
  accountPath,
  settingsPath,
  onOpenPath,
  onSignOut,
}: {
  session: CoreSession | null;
  workspace: WorkspaceSummary | null;
  accountPath?: string;
  settingsPath?: string;
  onOpenPath: (path: string) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = accessLabel(session, workspace);
  const closeAndRun = (action: () => void) => {
    setOpen(false);
    action();
  };

  return <div className="user-menu">
    <button className="user-button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="avatar">{userInitial(session)}</span>
      <span className="user-button-copy">
        <strong>{displayUser(session)}</strong>
        <small>{label}</small>
      </span>
    </button>
    {open ? <div className="user-popover">
      <SurfaceCard className="user-popover-card">
        <div className="user-popover-head">
          <div>
            <small>Account</small>
            <strong>{displayUser(session)}</strong>
            {session?.user?.email ? <p>{session.user.email}</p> : null}
          </div>
          <Badge>{label}</Badge>
        </div>
        <div className="user-popover-body">
          <small>Workspace</small>
          <strong>{workspace?.name ?? workspace?.id ?? "No workspace"}</strong>
          <p>{workspace?.status ?? "No active workspace"}</p>
        </div>
        <div className="user-popover-actions">
          {accountPath ? <button type="button" onClick={() => closeAndRun(() => onOpenPath(accountPath))}>Profile</button> : null}
          {settingsPath ? <button type="button" onClick={() => closeAndRun(() => onOpenPath(settingsPath))}>Settings</button> : null}
          <button type="button" onClick={() => closeAndRun(onSignOut)}>Sign out</button>
        </div>
      </SurfaceCard>
    </div> : null}
  </div>;
}
