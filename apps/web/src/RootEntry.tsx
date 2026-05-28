import { useEffect, useState } from "react";
import { App } from "./App";
import { invalidateApiCaches, loadEntrySession, type EntrySession } from "./api";
import { LoginPage } from "./LoginPage";
import { SurfaceCard, Badge } from "@v2/ui-kit";

type GateState = "checking" | "authenticated" | "anonymous" | "unavailable";

let sessionProbe: Promise<EntrySession> | null = null;

export function invalidatePublicSessionProbe() {
  sessionProbe = null;
  invalidateApiCaches();
}

function probeSession(): Promise<EntrySession> {
  sessionProbe ??= loadEntrySession().catch((error) => {
    sessionProbe = null;
    throw error;
  });
  return sessionProbe;
}

function protectedRedirectTarget() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function SessionProbePage({ unavailable = false }: { unavailable?: boolean }) {
  return <main className="login-page">
    <SurfaceCard className="login-panel">
      <div className="surface-header"><div><small>session</small><h2>{unavailable ? "Workspace unavailable" : "Checking session"}</h2></div><Badge>public</Badge></div>
      <p className="login-status">{unavailable ? "Workspace access could not be loaded." : "Verifying your sign-in status."}</p>
    </SurfaceCard>
  </main>;
}

export function RootEntry() {
  const publicRoute = window.location.pathname === "/login" || window.location.pathname === "/setup/owner" || window.location.pathname.startsWith("/public/");
  const [state, setState] = useState<GateState>(publicRoute ? "authenticated" : "checking");

  useEffect(() => {
    if (publicRoute) return;
    const invalidate = () => { invalidatePublicSessionProbe(); };
    window.addEventListener("v2-auth-changed", invalidate);
    let alive = true;
    void probeSession().then((session) => {
      if (!alive) return;
      setState(session.authenticated ? "authenticated" : "anonymous");
    }).catch(() => {
      if (!alive) return;
      setState("unavailable");
    });
    return () => {
      alive = false;
      window.removeEventListener("v2-auth-changed", invalidate);
    };
  }, [publicRoute]);

  if (publicRoute || state === "authenticated") return <App />;
  if (state === "anonymous") return <LoginPage redirectTo={protectedRedirectTarget()} />;
  return <SessionProbePage unavailable={state === "unavailable"} />;
}
