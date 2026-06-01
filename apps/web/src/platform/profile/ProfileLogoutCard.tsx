import { Button, SurfaceCard } from "@v2/ui-kit";
import type { ActionDefinition } from "@v2/ui-schema";
import type { TemplateCallbacks } from "./profile-types";

export function ProfileLogoutCard({ callbacks, signOutAction }: { callbacks?: TemplateCallbacks | undefined; signOutAction: ActionDefinition | undefined }) {
  return <SurfaceCard className="settings-subpanel profile-logout-card">
    <h3>Logout</h3>
    <p>End the current browser session and return to login.</p>
    {signOutAction ? <div className="actions"><Button className={signOutAction.variant === "danger" ? "danger" : ""} onClick={() => void callbacks?.onAction?.(signOutAction)}>{signOutAction.title}</Button></div> : null}
  </SurfaceCard>;
}
