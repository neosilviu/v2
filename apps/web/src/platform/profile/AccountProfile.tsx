import { useEffect, useMemo, useState } from "react";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import type { ActionDefinition } from "@v2/ui-schema";
import { ProfileDetailsDialog } from "./ProfileDetailsDialog";
import { ProfileLogoutCard } from "./ProfileLogoutCard";
import { ProfilePasswordCard } from "./ProfilePasswordCard";
import { ProfilePasskeyCard } from "./ProfilePasskeyCard";
import { ProfileSecurityCard } from "./ProfileSecurityCard";
import { ProfileSessionsDialog } from "./ProfileSessionsDialog";
import { ProfileTwoFactorCard } from "./ProfileTwoFactorCard";
import { ProfileWorkspaceCard } from "./ProfileWorkspaceCard";
import { fieldValue, workspaceRoleLabel } from "./profile-utils";
import type {
  AccountProfileRuntimeData,
  ProfilePageProps,
} from "./profile-types";

export function AccountProfile({ page, data, callbacks }: ProfilePageProps) {
  const source = (data ?? page.data) as AccountProfileRuntimeData | undefined;
  const profile = source?.profile ?? {};
  const workspaces = source?.workspaces ?? [];
  const currentWorkspace = source?.currentWorkspace ?? null;
  const activeSessions = profile.activeSessions ?? [];
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    currentWorkspace?.id ?? workspaces[0]?.id ?? "",
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const saveAction =
    page.actions.find(
      (item) => item.commandId === "platform.account.profile.save",
    ) ??
    page.actions.find((item) => item.intent === "submit") ??
    page.actions[0];
  const signOutAction = page.actions.find(
    (item) => item.commandId === "platform.account.sign-out",
  );
  const sessionCount = activeSessions.length;
  const stats = useMemo(
    () => [
      { label: "Name", value: fieldValue(profile.name, "unknown") },
      { label: "Email", value: profile.email || "unknown" },
      {
        label: "Access",
        value: profile.isPlatformAdmin
          ? "Superadmin"
          : workspaceRoleLabel(currentWorkspace, profile),
      },
      { label: "Language", value: fieldValue(profile.language) },
      { label: "Location", value: fieldValue(profile.location) },
      { label: "Time zone", value: fieldValue(profile.timezone) },
      { label: "Passkeys", value: String(profile.passkeys?.length ?? 0) },
      {
        label: "2FA",
        value: profile.twoFactorEnabled ? "enabled" : "disabled",
      },
      { label: "Sessions", value: String(sessionCount) },
    ],
    [currentWorkspace, profile, sessionCount],
  );

  useEffect(() => {
    const nextWorkspaceId = currentWorkspace?.id ?? workspaces[0]?.id ?? "";
    setSelectedWorkspaceId((current) => current || nextWorkspaceId);
  }, [currentWorkspace?.id, workspaces]);

  return (
    <div className="page-stack profile-layout">
      <SurfaceCard className="profile-panel profile-primary">
        <div className="surface-header">
          <div>
            <small>Profile</small>
            <h2>{page.title}</h2>
            <p>Your profile details and security settings.</p>
          </div>
          <Badge>
            {profile.isPlatformAdmin
              ? "superadmin"
              : profile.emailVerified
                ? "verified"
                : "account"}
          </Badge>
        </div>
        <div className="account-metrics">
          {stats.map((item) => (
            <div className="account-metric" key={item.label}>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        <div className="actions profile-main-actions">
          <Button className="primary" onClick={() => setDetailsOpen(true)}>
            Edit details
          </Button>
          <Button onClick={() => setSessionsOpen(true)}>Active sessions</Button>
        </div>
      </SurfaceCard>
      <div className="profile-columns">
        <div className="profile-column">
          <ProfilePasswordCard />
          <ProfilePasskeyCard passkeys={profile.passkeys ?? []} />
          <ProfileTwoFactorCard profile={profile} />
        </div>
        <div className="profile-column">
          <ProfileWorkspaceCard
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={setSelectedWorkspaceId}
            profile={profile}
          />
          <ProfileSecurityCard
            profile={profile}
            currentWorkspace={currentWorkspace}
            selectedWorkspaceId={selectedWorkspaceId}
            onOpenSessions={() => setSessionsOpen(true)}
          />
          <ProfileLogoutCard
            callbacks={callbacks}
            signOutAction={signOutAction as ActionDefinition | undefined}
          />
        </div>
      </div>
      <ProfileDetailsDialog
        open={detailsOpen}
        profile={profile}
        saveLabel={saveAction?.title ?? "Save profile"}
        onClose={() => setDetailsOpen(false)}
      />
      <ProfileSessionsDialog
        open={sessionsOpen}
        sessions={activeSessions}
        onClose={() => setSessionsOpen(false)}
      />
    </div>
  );
}
