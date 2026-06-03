import { useState, type FormEvent } from "react";
import { Button, SurfaceCard } from "@v2/ui-kit";
import { changePassword } from "../../auth-account-client";
import { errorMessage } from "./profile-utils";

export function ProfilePasswordCard() {
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
    if (!currentPassword) {
      setFeedback("Current password is required.");
      return;
    }
    if (newPassword.length < 8) {
      setFeedback("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback("Passwords do not match.");
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: values.revokeOtherSessions === "on",
      });
      setFormKey((value) => value + 1);
      setFeedback("Password updated.");
    } catch (error) {
      setFeedback(errorMessage(error, "Password change failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceCard className="settings-subpanel profile-password-card">
      <h3>Password</h3>
      <p>Change the password for this profile session.</p>
      {feedback ? (
        <p className="settings-inline-error profile-feedback" role="alert">
          {feedback}
        </p>
      ) : null}
      <form
        className="profile-form profile-inline-form"
        key={formKey}
        onSubmit={submit}
      >
        <label className="field">
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label className="field">
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        <label className="field">
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        <label className="template-check profile-checkbox">
          <input name="revokeOtherSessions" type="checkbox" defaultChecked />
          Sign out other devices after changing the password
        </label>
        <div className="actions">
          <Button className="primary" type="submit" disabled={busy}>
            {busy ? "Updating..." : "Change password"}
          </Button>
        </div>
      </form>
    </SurfaceCard>
  );
}
