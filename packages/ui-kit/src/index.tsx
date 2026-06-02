import type { Notification } from "@v2/rpc-contracts";
import { useEffect } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  PropsWithChildren,
} from "react";

export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`v2-button ${className}`.trim()} {...props} />;
}

export function SurfaceCard({
  children,
  className = "",
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <section className={`v2-surface ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function Badge({ children }: PropsWithChildren) {
  return <span className="v2-badge">{children}</span>;
}

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`v2-input ${className}`.trim()} {...props} />;
}

export function DateInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="date"
      className={`v2-date-input ${className}`.trim()}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`v2-select ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}

export function FormGroup({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`v2-form-group ${className}`.trim()}
      style={{ marginBottom: "16px", display: "grid", gap: "6px" }}
    >
      <label
        className="v2-form-label"
        style={{
          fontSize: "13px",
          fontWeight: 650,
          color: "var(--muted-strong)",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
  className = "",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      className={`v2-toggle-group ${className}`.trim()}
      style={{ display: "flex", gap: "8px" }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`v2-toggle-btn ${value === opt.value ? "active" : ""}`}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: "8px 12px",
            background:
              value === opt.value ? "var(--accent)" : "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: value === opt.value ? "#ffffff" : "var(--text)",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function KeyRecorder({
  value,
  onChange,
  isRecording,
  onStartRecording,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  isRecording: boolean;
  onStartRecording: () => void;
  className?: string;
}) {
  useEffect(() => {
    if (!isRecording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const keys: string[] = [];
      if (e.ctrlKey) keys.push("control");
      if (e.altKey) keys.push("alt");
      if (e.shiftKey) keys.push("shift");
      if (e.metaKey) keys.push("meta");
      keys.push(e.key.toLowerCase());
      onChange(keys.join("+"));
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isRecording, onChange]);

  return (
    <button
      type="button"
      onClick={onStartRecording}
      className={`v2-key-recorder ${isRecording ? "recording" : ""} ${className}`.trim()}
      style={{
        fontFamily: "monospace",
        background: isRecording ? "var(--danger)" : "var(--panel-2)",
        border: "1px solid var(--border)",
        padding: "6px 12px",
        borderRadius: "6px",
        fontSize: "12px",
        color: isRecording ? "#ffffff" : "var(--success, #10b981)",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      {isRecording ? "Press keys..." : value}
    </button>
  );
}

export function ColorPicker({
  value,
  onChange,
  presets = [],
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  presets?: string[];
  className?: string;
}) {
  return (
    <div className={`v2-color-picker ${className}`.trim()}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="v2-color-input"
        style={{
          width: "100%",
          height: "38px",
          cursor: "pointer",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: 0,
          background: "none",
        }}
      />
      {presets.length > 0 && (
        <div
          className="v2-color-presets"
          style={{ display: "flex", gap: "8px", marginTop: "8px" }}
        >
          {presets.map((color) => (
            <button
              key={color}
              type="button"
              className={`v2-color-preset-btn ${value === color ? "active" : ""}`}
              style={{
                backgroundColor: color,
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                border:
                  value === color
                    ? "2px solid var(--text)"
                    : "2px solid transparent",
                cursor: "pointer",
                padding: 0,
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
              onClick={() => onChange(color)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Grid({
  children,
  cols = 1,
  gap = "16px",
  className = "",
  style,
  ...props
}: PropsWithChildren<{
  cols?: number | string;
  gap?: string;
  className?: string;
  style?: React.CSSProperties;
}>) {
  return (
    <div
      className={`v2-grid ${className}`.trim()}
      style={{
        display: "grid",
        gridTemplateColumns:
          typeof cols === "number" ? `repeat(${cols}, minmax(0, 1fr))` : cols,
        gap,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function Flex({
  children,
  direction = "row",
  align = "stretch",
  justify = "flex-start",
  gap = "12px",
  className = "",
  style,
  ...props
}: PropsWithChildren<{
  direction?: "row" | "column";
  align?: string;
  justify?: string;
  gap?: string;
  className?: string;
  style?: React.CSSProperties;
}>) {
  return (
    <div
      className={`v2-flex ${className}`.trim()}
      style={{
        display: "flex",
        flexDirection: direction,
        alignItems: align,
        justifyContent: justify,
        gap,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function NotificationCenter({
  notifications,
  onDismiss,
}: {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}) {
  if (!notifications.length) return null;
  return (
    <aside
      className="notification-center"
      aria-live="polite"
      aria-label="Notifications"
    >
      {notifications.map((item) => (
        <article key={item.id} className={`notification ${item.level}`}>
          <div className="notification-head">
            <strong>{item.title}</strong>
            {item.dismissible ? (
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => onDismiss(item.id)}
              >
                ×
              </button>
            ) : null}
          </div>
          {item.message ? <p>{item.message}</p> : null}
          <small>{item.source}</small>
        </article>
      ))}
    </aside>
  );
}
