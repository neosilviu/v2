import { useState, type FormEvent } from "react";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { addPasskey } from "../../auth-account-client";
import { dateTimeLabel, errorMessage, refreshProfile } from "./profile-utils";
import type { ProfilePasskey } from "./profile-types";

export function ProfilePasskeyCard({
  passkeys,
}: {
  passkeys: ProfilePasskey[];
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const label = String(
      Object.fromEntries(new FormData(event.currentTarget)).passkeyLabel ?? "",
    ).trim();
    if (label.length < 2) {
      setFeedback("Passkey label must be at least 2 characters.");
      return;
    }
    if (label.length > 32) {
      setFeedback("Passkey label is too long.");
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await addPasskey(label);
      if (!result) {
        setFeedback("Passkey registration was cancelled.");
        return;
      }
      setFormKey((value) => value + 1);
      setFeedback("Passkey added. Refreshing profile...");
      window.setTimeout(refreshProfile, 250);
    } catch (error) {
      setFeedback(errorMessage(error, "Passkey registration failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceCard className="settings-subpanel profile-passkey-card">
      <h3>Passkeys</h3>
      <p>Register a device or security key for this profile.</p>
      {feedback ? (
        <p className="settings-inline-error profile-feedback" role="alert">
          {feedback}
        </p>
      ) : null}
      <form className="profile-passkey-form" key={formKey} onSubmit={submit}>
        <label className="field">
          Passkey label
          <input
            name="passkeyLabel"
            type="text"
            placeholder="e.g. iPhone, YubiKey"
            required
            autoComplete="off"
          />
        </label>
        <div className="actions">
          <Button className="primary" type="submit" disabled={busy}>
            {busy ? "Registering..." : "Add passkey"}
          </Button>
        </div>
      </form>
      <div className="settings-subpanel-table profile-passkey-table">
        {passkeys.length ? (
          passkeys.map((passkey) => (
            <div className="settings-subpanel-row" key={passkey.id}>
              <div>
                <strong>{passkey.name?.trim() || passkey.id}</strong>
                <small>
                  {passkey.deviceType} ·{" "}
                  {passkey.backedUp ? "backed up" : "not backed up"} ·{" "}
                  {dateTimeLabel(passkey.createdAt)}
                </small>
              </div>
              <Badge>passkey</Badge>
            </div>
          ))
        ) : (
          <p>No passkeys are enrolled yet.</p>
        )}
      </div>
    </SurfaceCard>
  );
}
