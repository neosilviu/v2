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
