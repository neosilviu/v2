import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AuthPublicLoginConfig, AuthUiContribution, LoginSlot } from "@v2/auth-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { AuthRequestError, loadLoginConfig, signInEmail } from "./auth-api";
import { authClient, authRedirectStorageKey, authTwoFactorPendingStorageKey } from "./auth-client";
import { verifyTwoFactorCode } from "./auth-account-client";
import { DeclarativeBlocks } from "./platform/DeclarativeSurface";

const loginSlots: LoginSlot[] = [
  "login.header",
  "login.branding",
  "login.beforeMethods",
  "login.password",
  "login.socialMethods",
  "login.passkey",
  "login.afterMethods",
  "login.footer",
  "login.legal",
];
type PublicLoginMethod = AuthPublicLoginConfig["methods"][number];

function safeRedirectTarget(redirectTo?: string) {
  const target = redirectTo ?? new URLSearchParams(window.location.search).get("redirectTo");
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\") || target.startsWith("/public/")) return "/";
  return target;
}

function isTwoFactorPage() {
  return window.location.pathname === "/login/two-factor";
}

function contributionsFor(slot: LoginSlot, contributions: AuthUiContribution[]) {
  return contributions.filter((item) => item.slot === slot).sort((left, right) => left.displayOrder - right.displayOrder);
}

function SlotRenderer({ slot, contributions }: { slot: LoginSlot; contributions: AuthUiContribution[] }) {
  const items = contributionsFor(slot, contributions);
  if (!items.length) return null;
  return <div className="login-slot" data-slot={slot}>{items.map((item) => <DeclarativeBlocks key={item.contributionId} schema={item.renderer} />)}</div>;
}

function PasswordMethod({ method, passkeyAvailable, allowSignup, redirectTo }: { method: PublicLoginMethod; passkeyAvailable: boolean; allowSignup: boolean; redirectTo: string | undefined }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("authenticating");
    if (mode === "signup" && !allowSignup) {
      setStatus("Registration is not open.");
      return;
    }
    try {
      const target = safeRedirectTarget(redirectTo);
      window.sessionStorage.setItem(authRedirectStorageKey, target);
      if (mode === "signin") {
        const result = await signInEmail({ email, password });
        const twoFactorPending = window.sessionStorage.getItem(authTwoFactorPendingStorageKey) === "1";
        if (result && typeof result === "object" && "twoFactorRedirect" in result) {
          setStatus("Two-factor verification required.");
          return;
        }
        if (twoFactorPending) {
          setStatus("Two-factor verification required.");
          return;
        }
      }
      else {
        const result = await authClient.signUp.email({ name, email, password });
        if (result.error) {
          setStatus("Authentication failed. Check your credentials and try again.");
          return;
        }
      }
    } catch (error) {
      setStatus(error instanceof AuthRequestError ? error.message : "Authentication failed. Check your credentials and try again.");
      return;
    }
    setStatus("signed in");
    window.sessionStorage.removeItem(authTwoFactorPendingStorageKey);
    window.location.assign(safeRedirectTarget(redirectTo));
  };

  return <form className="login-method password-method" onSubmit={(event) => void submit(event)}>
    <div className="method-header"><strong>{method.title}</strong><Badge>{mode === "signin" ? "sign in" : "sign up"}</Badge></div>
    {mode === "signup" ? <label>Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label> : null}
    <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete={passkeyAvailable ? "username webauthn" : "username"} required /></label>
    <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} required /></label>
    <div className="login-actions"><Button className="primary" type="submit">{mode === "signin" ? "Continue" : "Create account"}</Button>{allowSignup ? <Button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Use sign up" : "Use sign in"}</Button> : null}</div>
    {status ? <p className="login-status">{status}</p> : null}
  </form>;
}

function TwoFactorChallenge({ redirectTo }: { redirectTo?: string | undefined }) {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const value = code.trim();
    if (value.length < 6) {
      setStatus(mode === "backup" ? "Enter a backup code." : "Enter the code from your authenticator app.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = mode === "backup" ? await authClient.twoFactor.verifyBackupCode({ code: value, disableSession: false, trustDevice: true }) : await verifyTwoFactorCode(value, true);
      if ((result as { error?: unknown }).error) {
        setStatus("Two-factor verification failed.");
        return;
      }
      const target = safeRedirectTarget(redirectTo);
      window.sessionStorage.removeItem(authRedirectStorageKey);
      window.sessionStorage.removeItem(authTwoFactorPendingStorageKey);
      window.location.assign(target);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Two-factor verification failed.");
    } finally {
      setBusy(false);
    }
  };

  return <form className="login-method two-factor-method" onSubmit={(event) => void submit(event)}>
    <div className="method-header"><strong>Two-factor verification</strong><Badge>required</Badge></div>
    <div className="login-segment-tabs">
      <button type="button" className={mode === "totp" ? "segment-active" : ""} onClick={() => setMode("totp")}>Authenticator</button>
      <button type="button" className={mode === "backup" ? "segment-active" : ""} onClick={() => setMode("backup")}>Backup code</button>
    </div>
    <label>{mode === "totp" ? "Code from your authenticator" : "Backup code"}<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required /></label>
    <div className="login-actions"><Button className="primary" type="submit" disabled={busy}>{busy ? "Verifying..." : "Continue"}</Button></div>
    {status ? <p className="login-status">{status}</p> : null}
  </form>;
}

function SocialMethod({ method, redirectTo }: { method: PublicLoginMethod; redirectTo: string | undefined }) {
  if (!method.providerId) return null;
  const provider = method.providerId;
  const signIn = async () => {
    await authClient.signIn.social({ provider, callbackURL: safeRedirectTarget(redirectTo) });
  };
  return <button className="login-method social-method" type="button" onClick={() => void signIn()}>
    <span>{method.title}</span><Badge>{method.providerId}</Badge>
  </button>;
}

function PasskeyMethod({ method, supported, redirectTo }: { method: PublicLoginMethod; supported: boolean; redirectTo: string | undefined }) {
  const [status, setStatus] = useState<string | null>(null);
  const signIn = async () => {
    setStatus("checking passkey");
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setStatus("Passkey sign-in failed. Try another published method.");
      return;
    }
    setStatus("signed in");
    window.location.assign(safeRedirectTarget(redirectTo));
  };
  return <div className="login-method passkey-method">
    <div className="method-header"><strong>{method.title}</strong><Badge>{supported ? "available" : "unsupported"}</Badge></div>
    <Button type="button" disabled={!supported} onClick={() => void signIn()}>Continue with passkey</Button>
    {status ? <p className="login-status">{status}</p> : null}
  </div>;
}

function LoginMethods({ config, redirectTo }: { config: AuthPublicLoginConfig; redirectTo: string | undefined }) {
  const [passkeySupported, setPasskeySupported] = useState(false);
  useEffect(() => {
    setPasskeySupported(typeof window !== "undefined" && "PublicKeyCredential" in window);
  }, []);

  const methods = useMemo(() => [...config.methods].sort((left, right) => left.displayOrder - right.displayOrder), [config.methods]);
  const byType = (type: PublicLoginMethod["type"]) => methods.filter((method) => method.type === type);

  return <>
    {byType("password").map((method) => <PasswordMethod key={method.id} method={method} passkeyAvailable={passkeySupported && config.features.passkey} allowSignup={config.policy.registrationMode === "open"} redirectTo={redirectTo} />)}
    {config.policy.registrationMode === "invitation-only" ? <div className="login-method"><div className="method-header"><strong>Invitation required</strong><Badge>registration</Badge></div><p className="login-status">Account creation is available only through an invitation.</p></div> : null}
    {byType("social").map((method) => <SocialMethod key={method.id} method={method} redirectTo={redirectTo} />)}
    {byType("passkey").map((method) => <PasskeyMethod key={method.id} method={method} supported={passkeySupported} redirectTo={redirectTo} />)}
  </>;
}

export function LoginPage({ redirectTo }: { redirectTo?: string | undefined } = {}) {
  const [config, setConfig] = useState<AuthPublicLoginConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const twoFactorPage = isTwoFactorPage();
  const title = twoFactorPage ? "Verify two-factor code" : "Sign in";
  const description = twoFactorPage
    ? "Use your authenticator app or a backup code to finish signing in."
    : "Use the published authentication methods for this workspace.";
  const availableMethods = config?.methods.length ?? 0;
  const publishedMethods = config ? [
    config.features.password ? "Password" : null,
    config.features.passkey ? "Passkey" : null,
    config.features.social ? "Social" : null,
  ].filter((item): item is string => Boolean(item)).length : 0;

  useEffect(() => {
    void loadLoginConfig().then(setConfig).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Login config unavailable"));
  }, []);

  return <main className="login-page">
    <div className="login-shell">
      <SurfaceCard className="login-intro">
        <small>auth runtime</small>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="login-intro-metrics">
          <div>
            <strong>{twoFactorPage ? "2FA" : config?.policy.registrationMode === "open" ? "Open signup" : "Published login"}</strong>
            <span>{twoFactorPage ? "Challenge mode" : "Workspace policy"}</span>
          </div>
          <div>
            <strong>{String(availableMethods)}</strong>
            <span>Available methods</span>
          </div>
          <div>
            <strong>{String(publishedMethods)}</strong>
            <span>Published types</span>
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="login-panel">
        <div className="surface-header"><div><small>{twoFactorPage ? "Verification" : "Access"}</small><h2>{title}</h2></div><Badge>{twoFactorPage ? "2FA" : config?.policy.registrationMode === "open" ? "signup open" : "public"}</Badge></div>
        {error ? <p className="login-status">{error}</p> : null}
        {!config && !error ? <p>Loading login configuration...</p> : null}
        {twoFactorPage ? <TwoFactorChallenge redirectTo={redirectTo} /> : config ? loginSlots.map((slot) => {
          if (slot === "login.password" || slot === "login.socialMethods" || slot === "login.passkey") return <div key={slot} className="login-slot">
            <SlotRenderer slot={slot} contributions={config.uiContributions} />
            {slot === "login.password" ? <LoginMethods config={{ ...config, methods: config.methods.filter((method) => method.type === "password") }} redirectTo={redirectTo} /> : null}
            {slot === "login.socialMethods" ? <LoginMethods config={{ ...config, methods: config.methods.filter((method) => method.type === "social") }} redirectTo={redirectTo} /> : null}
            {slot === "login.passkey" ? <LoginMethods config={{ ...config, methods: config.methods.filter((method) => method.type === "passkey") }} redirectTo={redirectTo} /> : null}
          </div>;
          return <SlotRenderer key={slot} slot={slot} contributions={config.uiContributions} />;
        }) : null}
        {config && !twoFactorPage && !config.features.social && !config.features.passkey ? <p className="login-status">Social and passkey methods are hidden until explicitly published by an Auth administrator.</p> : null}
      </SurfaceCard>
    </div>
  </main>;
}
