import { useEffect, useState, type FormEvent } from "react";
import type { ProviderConnection } from "@v2/provider-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { addWorkersAiConnection, listConnections } from "./api";
export function ProviderSettingsSurface() {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [title, setTitle] = useState("Workers AI");
  const [status, setStatus] = useState("Loading connections…");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    const next = await listConnections();
    setConnections(next);
    setStatus(
      next.length
        ? "Connections available to Agent AI."
        : "No AI connections configured.",
    );
  };
  useEffect(() => {
    void refresh().catch(() => setStatus("Provider service unavailable."));
  }, []);
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await addWorkersAiConnection(title.trim());
      await refresh();
    } catch {
      setStatus("Could not add Workers AI connection.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SurfaceCard>
      <div className="surface-header">
        <div>
          <small>integrations</small>
          <h2>AI Providers</h2>
        </div>
        <Badge>native</Badge>
      </div>
      <p className="message">
        Workers AI uses the server-side Cloudflare binding. External providers
        require server-side configuration and are not configured from the
        browser.
      </p>
      <form className="composer" onSubmit={add}>
        <input
          aria-label="Connection title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add Workers AI"}
        </Button>
      </form>
      {connections.map((connection) => (
        <p key={connection.id} className="message">
          <strong>{connection.title}</strong> ·{" "}
          {connection.defaultModelId ?? "No model"} · {connection.status}
        </p>
      ))}
      <small>{status}</small>
    </SurfaceCard>
  );
}
