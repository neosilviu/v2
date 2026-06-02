import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import {
  consumeOwnerSetup,
  loadCoreSession,
  loadOwnerSetup,
  type CoreSession,
} from "./api";
import { AuthRequestError, ownerSetupSignUp, signInEmail } from "./auth-api";

function ownerSetupErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AuthRequestError) {
    const code = (error.code ?? "").toLowerCase();
    if (code.includes("expired"))
      return "This setup token expired. Ask an administrator to issue a new provisioning request.";
    if (code.includes("revoked"))
      return "This setup token was revoked. Use the latest owner setup email.";
    if (code.includes("consumed") || code.includes("replay"))
      return "This setup token was already consumed. Sign in to the workspace owner account.";
    if (code.includes("mismatch") || code.includes("email"))
      return "This setup link only authorizes the owner email shown above.";
    if (
      code.includes("account") ||
      code.includes("user_exists") ||
      error.status === 409
    )
      return "That owner account already exists. Sign in below and activate the setup link.";
    if (code.includes("mail") || code.includes("setup_unavailable"))
      return "Owner setup mail or provisioning is unavailable. Retry after Core Mail is configured.";
    return error.message || fallback;
  }
  return fallback;
}

export function OwnerSetupPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const [session, setSession] = useState<CoreSession | null>(null);
  const [setup, setSetup] = useState<{
    workspaceId: string;
    ownerEmail: string;
    status: string;
    expiresAt: string;
  } | null>(null);
  const [status, setStatus] = useState("Checking owner setup link...");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [existingPassword, setExistingPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      loadCoreSession().catch(() => null),
      token ? loadOwnerSetup(token) : Promise.reject(new Error("missing")),
    ])
      .then(([nextSession, nextSetup]) => {
        setSession(nextSession);
        setSetup(nextSetup.setup);
        setStatus(
          nextSetup.setup.status === "pending"
            ? "Owner setup link is ready"
            : `Owner setup is ${nextSetup.setup.status}`,
        );
      })
      .catch(() => setStatus("Owner setup link is unavailable or expired."));
  }, [token]);

  const consume = async () => {
    try {
      setStatus("Activating workspace owner...");
      const result = await consumeOwnerSetup(token);
      setStatus("Owner activated. Opening Security administration...");
      window.location.assign(
        `/settings?workspace=${encodeURIComponent(result.workspaceId)}`,
      );
    } catch (error) {
      setStatus(
        ownerSetupErrorMessage(
          error,
          "Owner setup could not be consumed by the current session.",
        ),
      );
    }
  };

  const createOwner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup || setup.status !== "pending") return;
    if (password.length < 8) {
      setStatus("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("Password confirmation does not match.");
      return;
    }
    setBusy(true);
    try {
      setStatus("Creating owner account...");
      await ownerSetupSignUp({
        token,
        email: setup.ownerEmail,
        name: name.trim() || setup.ownerEmail,
        password,
      });
      setStatus("Owner account created. Opening workspace...");
      window.location.assign(
        `/?workspace=${encodeURIComponent(setup.workspaceId)}`,
      );
    } catch (error) {
      setStatus(
        ownerSetupErrorMessage(
          error,
          "Owner account could not be created. If the account already exists, sign in below and activate the setup link.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const signInExisting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!setup || setup.status !== "pending") return;
    setBusy(true);
    try {
      setStatus("Signing in owner account...");
      await signInEmail({
        email: setup.ownerEmail,
        password: existingPassword,
      });
      const nextSession = await loadCoreSession();
      setSession(nextSession);
      await consumeOwnerSetup(token);
      setStatus("Owner activated. Opening workspace...");
      window.location.assign(
        `/?workspace=${encodeURIComponent(setup.workspaceId)}`,
      );
    } catch (error) {
      setStatus(
        ownerSetupErrorMessage(
          error,
          "Existing owner account could not activate this setup link.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const signedInEmail = session?.user?.email ?? "";
  const canConsume = Boolean(
    setup &&
    setup.status === "pending" &&
    session?.authenticated &&
    signedInEmail.toLowerCase() === setup.ownerEmail.toLowerCase(),
  );
  const loginTarget = `/login?redirectTo=${encodeURIComponent(`/setup/owner?token=${encodeURIComponent(token)}`)}`;

  return (
    <main className="login-page">
      <SurfaceCard className="login-panel">
        <div className="surface-header">
          <div>
            <small>workspace provisioning</small>
            <h2>Owner setup</h2>
          </div>
          <Badge>{setup?.status ?? "checking"}</Badge>
        </div>
        <p className="login-status">{status}</p>
        {setup ? (
          <div className="settings-subpanel">
            <p>Workspace: {setup.workspaceId}</p>
            <p>Owner email: {setup.ownerEmail}</p>
            <p>Expires: {new Date(setup.expiresAt).toLocaleString()}</p>
          </div>
        ) : null}
        {setup?.status === "pending" && !session?.authenticated ? (
          <form
            className="profile-form"
            onSubmit={(event) => void createOwner(event)}
          >
            <label className="field">
              Authorized email
              <input type="email" value={setup.ownerEmail} readOnly />
            </label>
            <label className="field">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                autoComplete="name"
              />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.currentTarget.value)
                }
                autoComplete="new-password"
                required
              />
            </label>
            <div className="actions">
              <Button className="primary" type="submit" disabled={busy}>
                Create owner account
              </Button>
            </div>
          </form>
        ) : null}
        {setup?.status === "pending" && !session?.authenticated ? (
          <form
            className="profile-form"
            onSubmit={(event) => void signInExisting(event)}
          >
            <p className="login-status">Already have this account?</p>
            <label className="field">
              Password
              <input
                type="password"
                value={existingPassword}
                onChange={(event) =>
                  setExistingPassword(event.currentTarget.value)
                }
                autoComplete="current-password"
                required
              />
            </label>
            <div className="actions">
              <Button type="submit" disabled={busy}>
                Sign in and activate
              </Button>
              <Button
                type="button"
                onClick={() => window.location.assign(loginTarget)}
              >
                Use full sign-in page
              </Button>
            </div>
          </form>
        ) : null}
        {session?.authenticated ? (
          <p className="login-status">Signed in as {signedInEmail}</p>
        ) : null}
        <div className="actions">
          <Button
            className="primary"
            disabled={!canConsume}
            onClick={() => void consume()}
          >
            Activate owner access
          </Button>
        </div>
      </SurfaceCard>
    </main>
  );
}
