import { useState } from "react";
import type { CoreSession, WorkspaceSummary } from "../api";

export function displayUser(session: CoreSession | null) {
  const user = session?.user;
  return user?.name?.trim() || user?.email || "Workspace user";
}

export function userInitial(session: CoreSession | null) {
  return displayUser(session).slice(0, 1).toUpperCase() || "W";
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
  secondaryAction,
}: {
  session: CoreSession | null;
  workspace: WorkspaceSummary | null;
  accountPath?: string;
  settingsPath?: string;
  onOpenPath: (path: string) => void;
  onSignOut: () => void;
  secondaryAction?: { label: string; onClick: () => void };
}) {
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
      {secondaryAction ? <button type="button" onClick={() => closeAndRun(secondaryAction.onClick)}>{secondaryAction.label}</button> : null}
      <button type="button" onClick={() => closeAndRun(onSignOut)}>Sign out</button>
    </div> : null}
  </div>;
}
