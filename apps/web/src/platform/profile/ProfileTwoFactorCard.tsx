import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import {
  disableTwoFactor,
  enableTwoFactor,
  generateTwoFactorBackupCodes,
  verifyTwoFactorCode,
} from "../../auth-account-client";
import { errorMessage, refreshProfile } from "./profile-utils";
import type { ProfileData } from "./profile-types";

export function ProfileTwoFactorCard({ profile }: { profile: ProfileData }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [setup, setSetup] = useState<{
    totpURI: string;
    backupCodes: string[];
  } | null>(null);
  const [regeneratedCodes, setRegeneratedCodes] = useState<string[] | null>(
    null,
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const backupCodes = regeneratedCodes ?? setup?.backupCodes ?? [];

  useEffect(() => {
    let alive = true;
    if (!setup?.totpURI) {
      setQrDataUrl(null);
      setQrError(null);
      return () => {
        alive = false;
      };
    }
    setQrDataUrl(null);
    setQrError(null);
    void QRCode.toDataURL(setup.totpURI, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((value: string) => {
        if (alive) setQrDataUrl(value);
      })
      .catch(() => {
        if (alive) setQrError("QR code could not be generated.");
      });
    return () => {
      alive = false;
    };
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
      setFeedback(
        "Scan the QR code in your authenticator app, then verify the code below.",
      );
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
    if (!code) {
      setFeedback("Enter the code from your authenticator app.");
      return;
    }
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
      const result = await generateTwoFactorBackupCodes(
        password.trim() || undefined,
      );
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

  return (
    <SurfaceCard className="settings-subpanel profile-twofactor-card">
      <div className="surface-header">
        <div>
          <h3>Two-factor authentication</h3>
          <p>
            {profile.twoFactorEnabled
              ? "Extra verification is on for this account."
              : "Add a second verification step for sign in."}
          </p>
        </div>
        <Badge>
          {profile.twoFactorEnabled
            ? "enabled"
            : setup
              ? "pending"
              : "disabled"}
        </Badge>
      </div>
      {feedback ? (
        <p className="settings-inline-error profile-feedback" role="alert">
          {feedback}
        </p>
      ) : null}
      {!profile.twoFactorEnabled && !setup ? (
        <form
          className="profile-form profile-inline-form"
          onSubmit={startSetup}
        >
          <label className="field">
            Password{" "}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Optional if you only use passkeys"
            />
          </label>
          <div className="actions">
            <Button className="primary" type="submit" disabled={busy}>
              {busy ? "Creating..." : "Enable 2FA"}
            </Button>
          </div>
        </form>
      ) : null}
      {setup ? (
        <div className="profile-twofactor-setup">
          <div className="profile-qr-block">
            <strong>Scan this QR code</strong>
            {qrDataUrl ? (
              <img
                className="profile-qr-code"
                src={qrDataUrl}
                alt="Two-factor authentication QR code"
              />
            ) : (
              <div className="profile-qr-placeholder">
                {qrError ?? "Generating QR code..."}
              </div>
            )}
          </div>
          <div className="profile-otp-block">
            <strong>Authenticator URI</strong>
            <code>{setup.totpURI}</code>
          </div>
          <div className="profile-otp-block">
            <strong>Backup codes</strong>
            <div className="profile-backup-codes">
              {backupCodes.map((code) => (
                <code key={code}>{code}</code>
              ))}
            </div>
          </div>
          <form
            className="profile-form profile-inline-form"
            onSubmit={verifySetup}
          >
            <label className="field">
              Verification code{" "}
              <input
                name="verificationCode"
                type="text"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                required
              />
            </label>
            <div className="actions">
              <Button className="primary" type="submit" disabled={busy}>
                {busy ? "Verifying..." : "Verify and finish"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      {profile.twoFactorEnabled ? (
        <>
          <form
            className="profile-form profile-inline-form"
            onSubmit={rotateBackupCodes}
          >
            <label className="field">
              Password{" "}
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Optional if you only use passkeys"
              />
            </label>
            <div className="actions">
              <Button type="submit" disabled={busy}>
                {busy ? "Regenerating..." : "Regenerate backup codes"}
              </Button>
            </div>
          </form>
          {regeneratedCodes ? (
            <div className="profile-otp-block">
              <strong>Latest backup codes</strong>
              <div className="profile-backup-codes">
                {regeneratedCodes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </div>
            </div>
          ) : null}
          <form
            className="profile-form profile-inline-form"
            onSubmit={disableSetup}
          >
            <label className="field">
              Password{" "}
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Optional if you only use passkeys"
              />
            </label>
            <div className="actions">
              <Button className="danger" type="submit" disabled={busy}>
                {busy ? "Disabling..." : "Disable 2FA"}
              </Button>
            </div>
          </form>
        </>
      ) : null}
    </SurfaceCard>
  );
}
