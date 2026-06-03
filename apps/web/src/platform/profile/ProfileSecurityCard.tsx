import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { navigateTo } from "./profile-utils";
import type { ProfileData, ProfileWorkspace } from "./profile-types";

export function ProfileSecurityCard({
  profile,
  currentWorkspace,
  selectedWorkspaceId,
  onOpenSessions,
}: {
  profile: ProfileData;
  currentWorkspace: ProfileWorkspace | null;
  selectedWorkspaceId: string;
  onOpenSessions: () => void;
}) {
  const activeSessionCount =
    profile.activeSessions?.length ?? profile.sessions ?? 0;
  const passkeyCount = profile.passkeys?.length ?? 0;
  return (
    <SurfaceCard className="settings-subpanel profile-security-card">
      <h3>Security</h3>
      <p>
        {passkeyCount
          ? `${passkeyCount} passkey${passkeyCount === 1 ? "" : "s"} enrolled.`
          : "No passkeys are enrolled yet."}
      </p>
      <p>
        {profile.twoFactorEnabled
          ? "Two-factor authentication is enabled."
          : "Two-factor authentication is disabled."}
      </p>
      <p>
        {activeSessionCount
          ? `${activeSessionCount} active session${activeSessionCount === 1 ? "" : "s"} tracked.`
          : "Only the current browser session is active."}
      </p>
      <div className="settings-subpanel-row">
        <div>
          <strong>
            {profile.emailVerified ? "Email verified" : "Email not verified"}
          </strong>
          <small>
            {profile.isPlatformAdmin ? "Protected platform account" : "Account"}
          </small>
        </div>
        <Badge>
          {profile.isPlatformAdmin
            ? "superadmin"
            : profile.twoFactorEnabled
              ? "2FA on"
              : "2FA off"}
        </Badge>
      </div>
      <div className="actions">
        <Button onClick={onOpenSessions}>Active sessions</Button>
        <Button
          onClick={() =>
            navigateTo("/settings", {
              workspace: currentWorkspace?.id ?? selectedWorkspaceId,
              tab: "platform.settings.security",
            })
          }
        >
          Open security settings
        </Button>
      </div>
    </SurfaceCard>
  );
}
