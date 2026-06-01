import { useEffect, useState } from "react";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { revokeOtherProfileSessions, revokeProfileSession } from "../../auth-account-client";
import { dateTimeLabel, errorMessage, refreshProfile, sessionDeviceLabel } from "./profile-utils";
import type { ProfileSession } from "./profile-types";

export function ProfileSessionsDialog({ open, sessions, onClose }: { open: boolean; sessions: ProfileSession[]; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    setBusy(false);
    setBusySessionId(null);
  }, [open, sessions.length]);

  const revokeOthers = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await revokeOtherProfileSessions();
      onClose();
      refreshProfile();
    } catch (error) {
      setFeedback(errorMessage(error, "Unable to log out other sessions."));
    } finally {
      setBusy(false);
    }
  };

  const revokeOne = async (sessionId: string) => {
    if (busy) return;
    setBusy(true);
    setBusySessionId(sessionId);
    setFeedback(null);
    try {
      const result = await revokeProfileSession(sessionId);
      onClose();
      if (result.currentSessionRevoked) window.location.assign("/login");
      else refreshProfile();
    } catch (error) {
      setFeedback(errorMessage(error, "Unable to log out the selected session."));
    } finally {
      setBusy(false);
      setBusySessionId(null);
    }
  };

  if (!open) return null;
  return <div className="settings-dialog-backdrop">
    <SurfaceCard className="settings-dialog profile-dialog profile-sessions-dialog">
      <div className="surface-header"><div><small>Profile</small><h3>Active sessions</h3><p>See where this account is signed in and log out devices you no longer use.</p></div><Button onClick={onClose} disabled={busy} type="button">Close</Button></div>
      {feedback ? <p className="settings-inline-error profile-feedback" role="alert">{feedback}</p> : null}
      <div className="actions profile-session-actions"><Button className="danger" onClick={() => void revokeOthers()} disabled={busy || sessions.length <= 1}>Log out other devices</Button></div>
      <div className="profile-session-list">
        {sessions.length ? sessions.map((session) => <div className="settings-subpanel-row profile-session-row" key={session.id}>
          <div><strong>{sessionDeviceLabel(session.userAgent, session.current)}</strong><small>{session.current ? "This device" : session.ipAddress ? `IP ${session.ipAddress}` : "IP unavailable"} · Started {dateTimeLabel(session.createdAt)} · Expires {dateTimeLabel(session.expiresAt)}</small></div>
          <div className="plugin-actions">{session.current ? <Badge>Current</Badge> : <Button className="danger" onClick={() => void revokeOne(session.id)} disabled={busy}>{busySessionId === session.id ? "Logging out..." : "Log out"}</Button>}</div>
        </div>) : <p>No active sessions were found.</p>}
      </div>
    </SurfaceCard>
  </div>;
}
