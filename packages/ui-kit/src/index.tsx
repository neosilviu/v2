import type { Notification } from "@v2/rpc-contracts";
import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from "react";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`v2-button ${className}`.trim()} {...props} />;
}

export function SurfaceCard({ children, className = "", ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return <section className={`v2-surface ${className}`.trim()} {...props}>{children}</section>;
}

export function Badge({ children }: PropsWithChildren) {
  return <span className="v2-badge">{children}</span>;
}

export function NotificationCenter({ notifications, onDismiss }: { notifications: Notification[]; onDismiss: (id: string) => void }) {
  if (!notifications.length) return null;
  return <aside className="notification-center" aria-live="polite" aria-label="Notifications">
    {notifications.map((item) => <article key={item.id} className={`notification ${item.level}`}>
      <div className="notification-head"><strong>{item.title}</strong>{item.dismissible ? <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(item.id)}>×</button> : null}</div>
      {item.message ? <p>{item.message}</p> : null}
      <small>{item.source}</small>
    </article>)}
  </aside>;
}
