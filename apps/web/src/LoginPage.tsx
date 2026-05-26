import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AuthPublicLoginConfig, AuthUiContribution, LoginSlot } from "@v2/auth-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { loadLoginConfig } from "./auth-api";
import { authClient } from "./auth-client";
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

function safeRedirectTarget() {
  const target = new URLSearchParams(window.location.search).get("redirectTo");
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\") || target.startsWith("/public/")) return "/";
  return target;
}

function contributionsFor(slot: LoginSlot, contributions: AuthUiContribution[]) {
  return contributions.filter((item) => item.slot === slot).sort((left, right) => left.displayOrder - right.displayOrder);
}

function SlotRenderer({ slot, contributions }: { slot: LoginSlot; contributions: AuthUiContribution[] }) {
  const items = contributionsFor(slot, contributions);
  if (!items.length) return null;
  return <div className="login-slot" data-slot={slot}>{items.map((item) => <DeclarativeBlocks key={item.contributionId} schema={item.renderer} />)}</div>;
}

function PasswordMethod({ method, passkeyAvailable, allowSignup }: { method: PublicLoginMethod; passkeyAvailable: boolean; allowSignup: boolean }) {
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
    const result = mode === "signin"
      ? await authClient.signIn.email({ email, password })
      : await authClient.signUp.email({ name, email, password });
    if (result.error) {
      setStatus("Authentication failed. Check your credentials and try again.");
      return;
    }
    setStatus("signed in");
    window.location.assign(safeRedirectTarget());
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

function SocialMethod({ method }: { method: PublicLoginMethod }) {
  if (!method.providerId) return null;
  const provider = method.providerId;
  const signIn = async () => {
    await authClient.signIn.social({ provider, callbackURL: safeRedirectTarget() });
  };
  return <button className="login-method social-method" type="button" onClick={() => void signIn()}>
    <span>{method.title}</span><Badge>{method.providerId}</Badge>
  </button>;
}

function PasskeyMethod({ method, supported }: { method: PublicLoginMethod; supported: boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const signIn = async () => {
    setStatus("checking passkey");
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setStatus("Passkey sign-in failed. Try another published method.");
      return;
    }
    setStatus("signed in");
    window.location.assign(safeRedirectTarget());
  };
  return <div className="login-method passkey-method">
    <div className="method-header"><strong>{method.title}</strong><Badge>{supported ? "available" : "unsupported"}</Badge></div>
    <Button type="button" disabled={!supported} onClick={() => void signIn()}>Continue with passkey</Button>
    {status ? <p className="login-status">{status}</p> : null}
  </div>;
}

function LoginMethods({ config }: { config: AuthPublicLoginConfig }) {
  const [passkeySupported, setPasskeySupported] = useState(false);
  useEffect(() => {
    setPasskeySupported(typeof window !== "undefined" && "PublicKeyCredential" in window);
  }, []);

  const methods = useMemo(() => [...config.methods].sort((left, right) => left.displayOrder - right.displayOrder), [config.methods]);
  const byType = (type: PublicLoginMethod["type"]) => methods.filter((method) => method.type === type);

  return <>
    {byType("password").map((method) => <PasswordMethod key={method.id} method={method} passkeyAvailable={passkeySupported && config.features.passkey} allowSignup={config.policy.registrationMode === "open"} />)}
    {config.policy.registrationMode === "invitation-only" ? <div className="login-method"><div className="method-header"><strong>Invitation required</strong><Badge>registration</Badge></div><p className="login-status">Account creation is available only through an invitation.</p></div> : null}
    {byType("social").map((method) => <SocialMethod key={method.id} method={method} />)}
    {byType("passkey").map((method) => <PasskeyMethod key={method.id} method={method} supported={passkeySupported} />)}
  </>;
}

export function LoginPage() {
  const [config, setConfig] = useState<AuthPublicLoginConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadLoginConfig().then(setConfig).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Login config unavailable"));
  }, []);

  return <main className="login-page">
    <SurfaceCard className="login-panel">
      <div className="surface-header"><div><small>auth runtime</small><h2>Sign in</h2></div><Badge>{config?.policy.registrationMode === "open" ? "signup open" : "public"}</Badge></div>
      {error ? <p className="login-status">{error}</p> : null}
      {!config && !error ? <p>Loading login configuration...</p> : null}
      {config ? loginSlots.map((slot) => {
        if (slot === "login.password" || slot === "login.socialMethods" || slot === "login.passkey") return <div key={slot} className="login-slot">
          <SlotRenderer slot={slot} contributions={config.uiContributions} />
          {slot === "login.password" ? <LoginMethods config={{ ...config, methods: config.methods.filter((method) => method.type === "password") }} /> : null}
          {slot === "login.socialMethods" ? <LoginMethods config={{ ...config, methods: config.methods.filter((method) => method.type === "social") }} /> : null}
          {slot === "login.passkey" ? <LoginMethods config={{ ...config, methods: config.methods.filter((method) => method.type === "passkey") }} /> : null}
        </div>;
        return <SlotRenderer key={slot} slot={slot} contributions={config.uiContributions} />;
      }) : null}
      {config && !config.features.social && !config.features.passkey ? <p className="login-status">Social and passkey methods are hidden until explicitly published by an Auth administrator.</p> : null}
    </SurfaceCard>
  </main>;
}
