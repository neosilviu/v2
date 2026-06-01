import { useEffect, useMemo, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import type { ActionDefinition, DeclarativePageContribution } from "@v2/ui-schema";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { addPasskey, changePassword, disableTwoFactor, enableTwoFactor, generateTwoFactorBackupCodes, revokeOtherProfileSessions, revokeProfileSession, updateProfileDetails, verifyTwoFactorCode } from "../auth-account-client";

type TemplateCallbacks = {
  onAction?: (action: ActionDefinition) => void | Promise<void>;
  onSubmit?: (page: DeclarativePageContribution, values: Record<string, FormDataEntryValue>) => void | Promise<void>;
};

type ProfilePageProps = {
  page: DeclarativePageContribution;
  data?: unknown;
  callbacks?: TemplateCallbacks | undefined;
};

type ProfilePasskey = {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: number | string;
};

type ProfileSession = {
  id: string;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: number | string;
  expiresAt: number | string;
  impersonatedBy: string | null;
};

type ProfileWorkspace = {
  id: string;
  name: string;
  status: string;
  roles?: Array<{ name: string }>;
};

type ProfileData = {
  name?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  language?: string | null;
  location?: string | null;
  timezone?: string | null;
  passkeys?: ProfilePasskey[];
  sessions?: number;
  activeSessions?: ProfileSession[];
  isPlatformAdmin?: boolean;
};

type AccountProfileRuntimeData = {
  profile?: ProfileData;
  workspaces?: ProfileWorkspace[];
  currentWorkspace?: ProfileWorkspace | null;
};

const fieldValue = (value: string | null | undefined, fallback = "unset") => value?.trim() || fallback;
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const refreshProfile = () => window.location.reload();

function navigateTo(pathname: string, params: Record<string, string | undefined> = {}) {
  const url = new URL(window.location.href);
  url.pathname = pathname;
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}

function dateTimeLabel(value: number | string) {
  const date = typeof value === "number" ? new Date(value > 1_000_000_000_000 ? value : value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
}

function sessionDeviceLabel(userAgent: string | null, current: boolean) {
  const ua = userAgent?.toLowerCase() ?? "";
  if (!ua) return current ? "Current browser" : "Browser session";
  if (ua.includes("iphone") || ua.includes("ipad")) return "iPhone / iPad";
  if (ua.includes("android")) return "Android device";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "Mac";
  if (ua.includes("windows")) return "Windows PC";
  if (ua.includes("linux")) return "Linux device";
  return current ? "Current browser" : "Browser session";
}

function workspaceRoleLabel(workspace: ProfileWorkspace | null | undefined, profile?: ProfileData) {
  if (profile?.isPlatformAdmin) return "Superadmin";
  return workspace?.roles?.map((role) => role.name).filter(Boolean).join(", ") || "Member";
}

function ProfilePasswordCard() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const currentPassword = String(values.currentPassword ?? "");
    const newPassword = String(values.newPassword ?? "");
    const confirmPassword = String(values.confirmPassword ?? "");
    if (!currentPassword) { setFeedback("Current password is required."); return; }
    if (newPassword.length < 8) { setFeedback("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setFeedback("Passwords do not match."); return; }
    setBusy(true);
    setFeedback(null);
    try {
      await changePassword({ currentPassword, newPassword, revokeOtherSessions: values.revokeOtherSessions === "on" });
      setFormKey((value) => value + 1);
      setFeedback("Password updated.");
    } catch (error) {
      setFeedback(errorMessage(error, "Password change failed."));
    } finally {
      setBusy(false);
    }
  };

  return <SurfaceCard className="settings-subpanel profile-password-card">
    <h3>Password</h3>
    <p>Change the password for this profile session.</p>
    {feedback ? <p className="settings-inline-error profile-feedback" role="alert">{feedback}</p> : null}
    <form className="profile-form profile-inline-form" key={formKey} onSubmit={submit}>
      <label className="field">Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
      <label className="field">New password<input name="newPassword" type="password" autoComplete="new-password" required minLength={8} /></label>
      <label className="field">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} /></label>
      <label className="template-check profile-checkbox"><input name="revokeOtherSessions" type="checkbox" defaultChecked />Sign out other devices after changing the password</label>
      <div className="actions"><Button className="primary" type="submit" disabled={busy}>{busy ? "Updating..." : "Change password"}</Button></div>
    </form>
  </SurfaceCard>;
}

function ProfilePasskeyCard({ passkeys }: { passkeys: ProfilePasskey[] }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const label = String(Object.fromEntries(new FormData(event.currentTarget)).passkeyLabel ?? "").trim();
    if (label.length < 2) { setFeedback("Passkey label must be at least 2 characters."); return; }
    if (label.length > 32) { setFeedback("Passkey label is too long."); return; }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await addPasskey(label);
      if (!result) { setFeedback("Passkey registration was cancelled."); return; }
      setFormKey((value) => value + 1);
      setFeedback("Passkey added. Refreshing profile...");
      window.setTimeout(refreshProfile, 250);
    } catch (error) {
      setFeedback(errorMessage(error, "Passkey registration failed."));
    } finally {
      setBusy(false);
    }
  };

  return <SurfaceCard className="settings-subpanel profile-passkey-card">
    <h3>Passkeys</h3>
    <p>Register a device or security key for this profile.</p>
    {feedback ? <p className="settings-inline-error profile-feedback" role="alert">{feedback}</p> : null}
    <form className="profile-passkey-form" key={formKey} onSubmit={submit}>
      <label className="field">Passkey label<input name="passkeyLabel" type="text" placeholder="e.g. iPhone, YubiKey" required autoComplete="off" /></label>
      <div className="actions"><Button className="primary" type="submit" disabled={busy}>{busy ? "Registering..." : "Add passkey"}</Button></div>
    </form>
    <div className="settings-subpanel-table profile-passkey-table">
      {passkeys.length ? passkeys.map((passkey) => <div className="settings-subpanel-row" key={passkey.id}>
        <div>
          <strong>{passkey.name?.trim() || passkey.id}</strong>
          <small>{passkey.deviceType} · {passkey.backedUp ? "backed up" : "not backed up"} · {dateTimeLabel(passkey.createdAt)}</small>
        </div>
        <Badge>passkey</Badge>
      </div>) : <p>No passkeys are enrolled yet.</p>}
    </div>
  </SurfaceCard>;
}

function ProfileWorkspaceCard({ workspaces, currentWorkspace, selectedWorkspaceId, onSelectWorkspace, profile }: { workspaces: ProfileWorkspace[]; currentWorkspace: ProfileWorkspace | null; selectedWorkspaceId: string; onSelectWorkspace: (workspaceId: string) => void; profile: ProfileData }) {
  const switchWorkspace = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const workspaceId = selectedWorkspaceId.trim();
    if (!workspaceId || workspaceId === currentWorkspace?.id) return;
    navigateTo(window.location.pathname, { workspace: workspaceId });
  };

  return <SurfaceCard className="settings-subpanel profile-workspace-card">
    <h3>Workspace</h3>
    <p>{currentWorkspace?.name ?? "Current workspace"}</p>
    <p>{workspaceRoleLabel(currentWorkspace, profile)}</p>
    <form className="profile-workspace-form" onSubmit={switchWorkspace}>
      <label className="field">Switch workspace
        <select value={selectedWorkspaceId} onChange={(event) => onSelectWorkspace(event.currentTarget.value)}>
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.status}</option>)}
        </select>
      </label>
      <div className="actions"><Button className="primary" type="submit" disabled={!selectedWorkspaceId || selectedWorkspaceId === currentWorkspace?.id}>Open workspace</Button></div>
    </form>
    <div className="settings-subpanel-table">
      {workspaces.map((workspace) => <div className="settings-subpanel-row" key={workspace.id}>
        <div>
          <strong>{workspace.name}</strong>
          <small>{workspace.id === currentWorkspace?.id ? "Current workspace" : profile.isPlatformAdmin ? "Available to Superadmin" : "Available workspace"}</small>
        </div>
        <Badge>{workspace.status}</Badge>
      </div>)}
    </div>
    <div className="settings-subpanel-row">
      <div><strong>Manage workspaces</strong><small>Create, edit and delete workspaces from the generic Security CRUD.</small></div>
      <Button onClick={() => navigateTo("/settings", { tab: "platform.settings.security" })}>Open security settings</Button>
    </div>
  </SurfaceCard>;
}

function ProfileSecurityCard({ profile, currentWorkspace, selectedWorkspaceId, onOpenSessions }: { profile: ProfileData; currentWorkspace: ProfileWorkspace | null; selectedWorkspaceId: string; onOpenSessions: () => void }) {
  const activeSessionCount = profile.activeSessions?.length ?? profile.sessions ?? 0;
  const passkeyCount = profile.passkeys?.length ?? 0;
  return <SurfaceCard className="settings-subpanel profile-security-card">
    <h3>Security</h3>
    <p>{passkeyCount ? `${passkeyCount} passkey${passkeyCount === 1 ? "" : "s"} enrolled.` : "No passkeys are enrolled yet."}</p>
    <p>{profile.twoFactorEnabled ? "Two-factor authentication is enabled." : "Two-factor authentication is disabled."}</p>
    <p>{activeSessionCount ? `${activeSessionCount} active session${activeSessionCount === 1 ? "" : "s"} tracked.` : "Only the current browser session is active."}</p>
    <div className="settings-subpanel-row">
      <div><strong>{profile.emailVerified ? "Email verified" : "Email not verified"}</strong><small>{profile.isPlatformAdmin ? "Protected platform account" : "Account"}</small></div>
      <Badge>{profile.isPlatformAdmin ? "superadmin" : profile.twoFactorEnabled ? "2FA on" : "2FA off"}</Badge>
    </div>
    <div className="actions">
      <Button onClick={onOpenSessions}>Active sessions</Button>
      <Button onClick={() => navigateTo("/settings", { workspace: currentWorkspace?.id ?? selectedWorkspaceId, tab: "platform.settings.security" })}>Open security settings</Button>
    </div>
  </SurfaceCard>;
}

function ProfileDetailsDialog({ open, profile, saveLabel, onClose }: { open: boolean; profile: ProfileData; saveLabel: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [name, setName] = useState(profile.name ?? "");
  const [language, setLanguage] = useState(profile.language ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [timezone, setTimezone] = useState(profile.timezone ?? "");

  useEffect(() => {
    if (!open) return;
    setName(profile.name ?? "");
    setLanguage(profile.language ?? "");
    setLocation(profile.location ?? "");
    setTimezone(profile.timezone ?? "");
    setFeedback(null);
    setBusy(false);
  }, [open, profile.language, profile.location, profile.name, profile.timezone]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const nextName = name.trim();
    if (!nextName) { setFeedback("Display name is required."); return; }
    setBusy(true);
    setFeedback(null);
    try {
      await updateProfileDetails({ name: nextName, language: language.trim() || null, location: location.trim() || null, timezone: timezone.trim() || null });
      onClose();
      refreshProfile();
    } catch (error) {
      setFeedback(errorMessage(error, "Profile update failed."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return <div className="settings-dialog-backdrop">
    <SurfaceCard className="settings-dialog profile-dialog">
      <div className="surface-header"><div><small>Profile</small><h3>Edit details</h3><p>Keep the compact profile card clean and edit the personal details here.</p></div><Button onClick={onClose} disabled={busy} type="button">Close</Button></div>
      {feedback ? <p className="settings-inline-error profile-feedback" role="alert">{feedback}</p> : null}
      <form className="profile-form profile-dialog-form" onSubmit={submit}>
        <label className="field">Display name<input name="name" value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder="Your name" autoComplete="name" required minLength={2} /></label>
        <label className="field">Language<input name="language" value={language} onChange={(event) => setLanguage(event.currentTarget.value)} placeholder="en or ro" autoComplete="language" /></label>
        <label className="field">Location<input name="location" value={location} onChange={(event) => setLocation(event.currentTarget.value)} placeholder="Bucharest, Romania" autoComplete="street-address" /></label>
        <label className="field">Time zone<input name="timezone" value={timezone} onChange={(event) => setTimezone(event.currentTarget.value)} placeholder="Europe/Bucharest" autoComplete="off" /></label>
        <div className="profile-dialog-note"><p>Email: <strong>{profile.email ?? "Unknown"}</strong></p><p>These values are kept on your user profile, not in the Web shell.</p></div>
        <div className="actions settings-dialog-actions"><Button onClick={onClose} disabled={busy} type="button">Cancel</Button><Button className="primary" type="submit" disabled={busy}>{busy ? "Saving..." : saveLabel}</Button></div>
      </form>
    </SurfaceCard>
  </div>;
}

function ProfileSessionsDialog({ open, sessions, onClose }: { open: boolean; sessions: ProfileSession[]; onClose: () => void }) {
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

function ProfileTwoFactorCard({ profile }: { profile: ProfileData }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const backupCodes = regeneratedCodes ?? setup?.backupCodes ?? [];

  useEffect(() => {
    let alive = true;
    if (!setup?.totpURI) {
      setQrDataUrl(null);
      setQrError(null);
      return () => { alive = false; };
    }
    setQrDataUrl(null);
    setQrError(null);
    void QRCode.toDataURL(setup.totpURI, { width: 220, margin: 1, errorCorrectionLevel: "M" })
      .then((value: string) => { if (alive) setQrDataUrl(value); })
      .catch(() => { if (alive) setQrError("QR code could not be generated."); });
    return () => { alive = false; };
  }, [setup?.totpURI]);

  const startSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await enableTwoFactor(password.trim() || undefined);
      setSetup({ totpURI: result.totpURI, backupCodes: result.backupCodes });
      setRegeneratedCodes(result.backupCodes);
      setFeedback("Scan the QR code in your authenticator app, then verify the code below.");
    } catch (error) {
      setFeedback(errorMessage(error, "Two-factor enrollment failed."));
    } finally {
      setBusy(false);
    }
  };

  const verifySetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const code = verificationCode.trim();
    if (!code) { setFeedback("Enter the code from your authenticator app."); return; }
    setBusy(true);
    setFeedback(null);
    try {
      await verifyTwoFactorCode(code, true);
      refreshProfile();
    } catch (error) {
      setFeedback(errorMessage(error, "Two-factor verification failed."));
    } finally {
      setBusy(false);
    }
  };

  const rotateBackupCodes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await generateTwoFactorBackupCodes(password.trim() || undefined);
      setRegeneratedCodes(result.backupCodes);
      setFeedback("Backup codes were regenerated.");
    } catch (error) {
      setFeedback(errorMessage(error, "Backup code regeneration failed."));
    } finally {
      setBusy(false);
    }
  };

  const disableSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      await disableTwoFactor(password.trim() || undefined);
      refreshProfile();
    } catch (error) {
      setFeedback(errorMessage(error, "Two-factor disable failed."));
    } finally {
      setBusy(false);
    }
  };

  return <SurfaceCard className="settings-subpanel profile-twofactor-card">
    <div className="surface-header"><div><h3>Two-factor authentication</h3><p>{profile.twoFactorEnabled ? "Extra verification is on for this account." : "Add a second verification step for sign in."}</p></div><Badge>{profile.twoFactorEnabled ? "enabled" : setup ? "pending" : "disabled"}</Badge></div>
    {feedback ? <p className="settings-inline-error profile-feedback" role="alert">{feedback}</p> : null}
    {!profile.twoFactorEnabled && !setup ? <form className="profile-form profile-inline-form" onSubmit={startSetup}>
      <label className="field">Password <input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Optional if you only use passkeys" /></label>
      <div className="actions"><Button className="primary" type="submit" disabled={busy}>{busy ? "Creating..." : "Enable 2FA"}</Button></div>
    </form> : null}
    {setup ? <div className="profile-twofactor-setup">
      <div className="profile-qr-block"><strong>Scan this QR code</strong>{qrDataUrl ? <img className="profile-qr-code" src={qrDataUrl} alt="Two-factor authentication QR code" /> : <div className="profile-qr-placeholder">{qrError ?? "Generating QR code..."}</div>}</div>
      <div className="profile-otp-block"><strong>Authenticator URI</strong><code>{setup.totpURI}</code></div>
      <div className="profile-otp-block"><strong>Backup codes</strong><div className="profile-backup-codes">{backupCodes.map((code) => <code key={code}>{code}</code>)}</div></div>
      <form className="profile-form profile-inline-form" onSubmit={verifySetup}>
        <label className="field">Verification code <input name="verificationCode" type="text" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required /></label>
        <div className="actions"><Button className="primary" type="submit" disabled={busy}>{busy ? "Verifying..." : "Verify and finish"}</Button></div>
      </form>
    </div> : null}
    {profile.twoFactorEnabled ? <>
      <form className="profile-form profile-inline-form" onSubmit={rotateBackupCodes}>
        <label className="field">Password <input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Optional if you only use passkeys" /></label>
        <div className="actions"><Button type="submit" disabled={busy}>{busy ? "Regenerating..." : "Regenerate backup codes"}</Button></div>
      </form>
      {regeneratedCodes ? <div className="profile-otp-block"><strong>Latest backup codes</strong><div className="profile-backup-codes">{regeneratedCodes.map((code) => <code key={code}>{code}</code>)}</div></div> : null}
      <form className="profile-form profile-inline-form" onSubmit={disableSetup}>
        <label className="field">Password <input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Optional if you only use passkeys" /></label>
        <div className="actions"><Button className="danger" type="submit" disabled={busy}>{busy ? "Disabling..." : "Disable 2FA"}</Button></div>
      </form>
    </> : null}
  </SurfaceCard>;
}

function ProfileLogoutCard({ callbacks, signOutAction }: { callbacks?: TemplateCallbacks | undefined; signOutAction: ActionDefinition | undefined }) {
  return <SurfaceCard className="settings-subpanel profile-logout-card">
    <h3>Logout</h3>
    <p>End the current browser session and return to login.</p>
    {signOutAction ? <div className="actions"><Button className={signOutAction.variant === "danger" ? "danger" : ""} onClick={() => void callbacks?.onAction?.(signOutAction)}>{signOutAction.title}</Button></div> : null}
  </SurfaceCard>;
}

export function AccountProfile({ page, data, callbacks }: ProfilePageProps) {
  const source = (data ?? page.data) as AccountProfileRuntimeData | undefined;
  const profile = source?.profile ?? {};
  const workspaces = source?.workspaces ?? [];
  const currentWorkspace = source?.currentWorkspace ?? null;
  const activeSessions = profile.activeSessions ?? [];
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(currentWorkspace?.id ?? workspaces[0]?.id ?? "");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const saveAction = page.actions.find((item) => item.commandId === "platform.account.profile.save") ?? page.actions.find((item) => item.intent === "submit") ?? page.actions[0];
  const signOutAction = page.actions.find((item) => item.commandId === "platform.account.sign-out");
  const sessionCount = activeSessions.length || profile.sessions || 0;
  const stats = useMemo(() => [
    { label: "Name", value: fieldValue(profile.name, "unknown") },
    { label: "Email", value: profile.email || "unknown" },
    { label: "Access", value: profile.isPlatformAdmin ? "Superadmin" : workspaceRoleLabel(currentWorkspace, profile) },
    { label: "Language", value: fieldValue(profile.language) },
    { label: "Location", value: fieldValue(profile.location) },
    { label: "Time zone", value: fieldValue(profile.timezone) },
    { label: "Passkeys", value: String(profile.passkeys?.length ?? 0) },
    { label: "2FA", value: profile.twoFactorEnabled ? "enabled" : "disabled" },
    { label: "Sessions", value: String(sessionCount) },
  ], [currentWorkspace, profile, sessionCount]);

  useEffect(() => {
    const nextWorkspaceId = currentWorkspace?.id ?? workspaces[0]?.id ?? "";
    setSelectedWorkspaceId((current) => current || nextWorkspaceId);
  }, [currentWorkspace?.id, workspaces]);

  return <div className="page-stack profile-layout">
    <SurfaceCard className="profile-panel profile-primary">
      <div className="surface-header">
        <div><small>Profile</small><h2>{page.title}</h2><p>Your profile details and security settings.</p></div>
        <Badge>{profile.isPlatformAdmin ? "superadmin" : profile.emailVerified ? "verified" : "account"}</Badge>
      </div>
      <div className="account-metrics">{stats.map((item) => <div className="account-metric" key={item.label}><small>{item.label}</small><strong>{item.value}</strong></div>)}</div>
      <div className="actions profile-main-actions"><Button className="primary" onClick={() => setDetailsOpen(true)}>Edit details</Button><Button onClick={() => setSessionsOpen(true)}>Active sessions</Button></div>
    </SurfaceCard>
    <div className="profile-columns">
      <div className="profile-column"><ProfilePasswordCard /><ProfilePasskeyCard passkeys={profile.passkeys ?? []} /><ProfileTwoFactorCard profile={profile} /></div>
      <div className="profile-column"><ProfileWorkspaceCard workspaces={workspaces} currentWorkspace={currentWorkspace} selectedWorkspaceId={selectedWorkspaceId} onSelectWorkspace={setSelectedWorkspaceId} profile={profile} /><ProfileSecurityCard profile={profile} currentWorkspace={currentWorkspace} selectedWorkspaceId={selectedWorkspaceId} onOpenSessions={() => setSessionsOpen(true)} /><ProfileLogoutCard callbacks={callbacks} signOutAction={signOutAction} /></div>
    </div>
    <ProfileDetailsDialog open={detailsOpen} profile={profile} saveLabel={saveAction?.title ?? "Save profile"} onClose={() => setDetailsOpen(false)} />
    <ProfileSessionsDialog open={sessionsOpen} sessions={activeSessions} onClose={() => setSessionsOpen(false)} />
  </div>;
}
