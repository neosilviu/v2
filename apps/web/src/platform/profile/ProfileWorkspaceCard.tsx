import { type FormEvent } from "react";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { navigateTo, workspaceRoleLabel } from "./profile-utils";
import type { ProfileData, ProfileWorkspace } from "./profile-types";

export function ProfileWorkspaceCard({
  workspaces,
  currentWorkspace,
  selectedWorkspaceId,
  onSelectWorkspace,
  profile,
}: {
  workspaces: ProfileWorkspace[];
  currentWorkspace: ProfileWorkspace | null;
  selectedWorkspaceId: string;
  onSelectWorkspace: (workspaceId: string) => void;
  profile: ProfileData;
}) {
  const switchWorkspace = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const workspaceId = selectedWorkspaceId.trim();
    if (!workspaceId || workspaceId === currentWorkspace?.id) return;
    navigateTo(window.location.pathname, { workspace: workspaceId });
  };

  return (
    <SurfaceCard className="settings-subpanel profile-workspace-card">
      <h3>Workspace</h3>
      <p>{currentWorkspace?.name ?? "Current workspace"}</p>
      <p>{workspaceRoleLabel(currentWorkspace, profile)}</p>
      <form className="profile-workspace-form" onSubmit={switchWorkspace}>
        <label className="field">
          Switch workspace
          <select
            value={selectedWorkspaceId}
            onChange={(event) => onSelectWorkspace(event.currentTarget.value)}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name} · {workspace.status}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <Button
            className="primary"
            type="submit"
            disabled={
              !selectedWorkspaceId ||
              selectedWorkspaceId === currentWorkspace?.id
            }
          >
            Open workspace
          </Button>
        </div>
      </form>
      <div className="settings-subpanel-table">
        {workspaces.map((workspace) => (
          <div className="settings-subpanel-row" key={workspace.id}>
            <div>
              <strong>{workspace.name}</strong>
              <small>
                {workspace.id === currentWorkspace?.id
                  ? "Current workspace"
                  : profile.isPlatformAdmin
                    ? "Available to Superadmin"
                    : "Available workspace"}
              </small>
            </div>
            <Badge>{workspace.status}</Badge>
          </div>
        ))}
      </div>
      <div className="settings-subpanel-row">
        <div>
          <strong>Manage workspaces</strong>
          <small>
            Create, edit and delete workspaces from the generic Security CRUD.
          </small>
        </div>
        <Button
          onClick={() =>
            navigateTo("/settings", { tab: "platform.settings.security" })
          }
        >
          Open security settings
        </Button>
      </div>
    </SurfaceCard>
  );
}
