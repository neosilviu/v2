import { useEffect, useState } from "react";
import { App } from "./App";
import { isCoreAuthRequiredError, loadCoreSession, type CoreSession } from "./api";
import { LoginPage } from "./LoginPage";
import { SurfaceCard, Badge } from "@v2/ui-kit";

type GateState = "checking" | "authenticated" | "anonymous" | "unavailable";

let publicSessionProbe: Promise<CoreSession> | null = null;

function probeSession(): Promise<CoreSession> {
  publicSessionProbe ??= loadCoreSession().catch((error) => {
    publicSessionProbe = null;
    throw error;
  });
  return publicSessionProbe;
}

function protectedRedirectTarget() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function SessionProbePage({ unavailable = false }: { unavailable?: boolean }) {
  return <main className="login-page">
    <SurfaceCard className="login-panel">
      <div className="surface-header"><div><small>session</small><h2>{unavailable ? "Authentication unavailable" : "Checking session"}</h2></div><Badge>public</Badge></div>
      <p className="login-status">{unavailable ? "Auth session could not be read. No protected workspace request was made." : "Checking your public session before loading protected workspace data."}</p>
    </SurfaceCard>
  </main>;
}

export function RootEntry() {
  const publicRoute = window.location.pathname === "/login" || window.location.pathname === "/setup/owner" || window.location.pathname.startsWith("/public/");
  const [state, setState] = useState<GateState>(publicRoute ? "authenticated" : "checking");

  useEffect(() => {
    if (publicRoute) return;
    let alive = true;
    void probeSession().then((session) => {
      if (!alive) return;
      setState(session.authenticated ? "authenticated" : "anonymous");
    }).catch((error: unknown) => {
      if (!alive) return;
      setState(isCoreAuthRequiredError(error) ? "anonymous" : "unavailable");
    });
    return () => { alive = false; };
  }, [publicRoute]);

  if (publicRoute || state === "authenticated") return <App />;
  if (state === "anonymous") return <LoginPage redirectTo={protectedRedirectTarget()} />;
  return <SessionProbePage unavailable={state === "unavailable"} />;
}
