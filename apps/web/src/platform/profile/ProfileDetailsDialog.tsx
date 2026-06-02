import { useEffect, useState, type FormEvent } from "react";
import { Button, SurfaceCard } from "@v2/ui-kit";
import { updateProfileDetails } from "../../auth-account-client";
import { errorMessage, refreshProfile } from "./profile-utils";
import type { ProfileData } from "./profile-types";

export function ProfileDetailsDialog({
  open,
  profile,
  saveLabel,
  onClose,
}: {
  open: boolean;
  profile: ProfileData;
  saveLabel: string;
  onClose: () => void;
}) {
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
  }, [
    open,
    profile.language,
    profile.location,
    profile.name,
    profile.timezone,
  ]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const nextName = name.trim();
    if (!nextName) {
      setFeedback("Display name is required.");
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await updateProfileDetails({
        name: nextName,
        language: language.trim() || null,
        location: location.trim() || null,
        timezone: timezone.trim() || null,
      });
      onClose();
      refreshProfile();
    } catch (error) {
      setFeedback(errorMessage(error, "Profile update failed."));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="settings-dialog-backdrop">
      <SurfaceCard className="settings-dialog profile-dialog">
        <div className="surface-header">
          <div>
            <small>Profile</small>
            <h3>Edit details</h3>
            <p>
              Keep the compact profile card clean and edit the personal details
              here.
            </p>
          </div>
          <Button onClick={onClose} disabled={busy} type="button">
            Close
          </Button>
        </div>
        {feedback ? (
          <p className="settings-inline-error profile-feedback" role="alert">
            {feedback}
          </p>
        ) : null}
        <form className="profile-form profile-dialog-form" onSubmit={submit}>
          <label className="field">
            Display name
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="Your name"
              autoComplete="name"
              required
              minLength={2}
            />
          </label>
          <label className="field">
            Language
            <input
              name="language"
              value={language}
              onChange={(event) => setLanguage(event.currentTarget.value)}
              placeholder="en or ro"
              autoComplete="language"
            />
          </label>
          <label className="field">
            Location
            <input
              name="location"
              value={location}
              onChange={(event) => setLocation(event.currentTarget.value)}
              placeholder="Bucharest, Romania"
              autoComplete="street-address"
            />
          </label>
          <label className="field">
            Time zone
            <input
              name="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.currentTarget.value)}
              placeholder="Europe/Bucharest"
              autoComplete="off"
            />
          </label>
          <div className="profile-dialog-note">
            <p>
              Email: <strong>{profile.email ?? "Unknown"}</strong>
            </p>
            <p>
              These values are kept on your user profile, not in the Web shell.
            </p>
          </div>
          <div className="actions settings-dialog-actions">
            <Button onClick={onClose} disabled={busy} type="button">
              Cancel
            </Button>
            <Button className="primary" type="submit" disabled={busy}>
              {busy ? "Saving..." : saveLabel}
            </Button>
          </div>
        </form>
      </SurfaceCard>
    </div>
  );
}
