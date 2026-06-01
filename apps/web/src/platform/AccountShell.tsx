import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { loadCoreSession, type CoreSession, type ShellBootstrap, type WorkspaceSummary } from "../api";
import { updateAuthProfile } from "../auth-api";

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

export function AccountPage({
  session,
  bootstrap,
  onSessionChanged,
  onSignOut,
  onSwitchWorkspace,
  onOpenSettings,
}: {
  session: CoreSession | null;
  bootstrap: ShellBootstrap;
  onSessionChanged: (session: CoreSession) => void;
  onSignOut: () => void;
  onSwitchWorkspace?: (workspaceId: string) => void;
  onOpenSettings?: () => void;
}) {
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
      <div className="surface-header">
        <div>
          <small>account</small>
          <h2>My Account</h2>
          <p>{status}</p>
        </div>
        <Badge>{(session?.isSuperadmin ?? session?.isAdmin) ? "superadmin" : "member"}</Badge>
      </div>
      <form className="profile-form" onSubmit={submit}>
        <label className="field">Display name<input value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="Your name" /></label>
        <div className="actions">
          <Button className="primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Save profile"}</Button>
          <Button type="button" onClick={onSignOut}>Sign out</Button>
        </div>
      </form>
    </SurfaceCard>
    <div className="settings-grid">
      <section className="settings-subpanel">
        <h3>Email</h3>
        <p>{session?.user?.email ?? "unknown"}</p>
      </section>
      <section className="settings-subpanel">
        <h3>Workspace access</h3>
        <p>{bootstrap.currentWorkspace.name}</p>
        <p>{bootstrap.currentWorkspace.roles.map((role) => role.name).join(", ") || "Member"}</p>
        {onSwitchWorkspace ? <div className="account-workspace-list">
          {bootstrap.workspaces.map((workspace) => <Button key={workspace.id} type="button" className={workspace.id === bootstrap.currentWorkspace.id ? "primary" : ""} disabled={workspace.id === bootstrap.currentWorkspace.id} onClick={() => onSwitchWorkspace(workspace.id)}>{workspace.id === bootstrap.currentWorkspace.id ? "Current" : `Open ${workspace.name}`}</Button>)}
        </div> : null}
      </section>
      <section className="settings-subpanel">
        <h3>Passkeys</h3>
        <p>Manage passkeys from Security settings when enabled by your workspace.</p>
        {onOpenSettings ? <div className="actions"><Button type="button" onClick={onOpenSettings}>Open Security</Button></div> : null}
      </section>
      <section className="settings-subpanel">
        <h3>Active sessions</h3>
        <p>Current browser session is active.</p>
      </section>
    </div>
  </div>;
}
