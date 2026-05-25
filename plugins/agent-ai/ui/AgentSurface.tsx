import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AgentChannel, AgentMessage, AgentProviderBinding } from "@v2/agent-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { loadChannels, loadMessages, loadProviderBindings, selectProvider, sendAndRun } from "./api";

export function AgentSurface() {
  const [channels, setChannels] = useState<AgentChannel[]>([]);
  const [providers, setProviders] = useState<AgentProviderBinding[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Loading channels…");
  const [busy, setBusy] = useState(false);
  const channel = useMemo(() => channels.find((item) => item.id === channelId) ?? null, [channels, channelId]);

  async function reload() {
    const [nextChannels, nextProviders] = await Promise.all([loadChannels(), loadProviderBindings()]);
    setChannels(nextChannels);
    setProviders(nextProviders);
    const nextChannelId = channelId ?? nextChannels[0]?.id ?? null;
    setChannelId(nextChannelId);
    if (nextChannelId) setMessages(await loadMessages(nextChannelId));
    setStatus(nextProviders.length ? "Ready" : "Add a provider connection to start chatting.");
  }
  useEffect(() => { void reload().catch(() => setStatus("Agent AI service unavailable.")); }, []);
  useEffect(() => { if (channelId) void loadMessages(channelId).then(setMessages).catch(() => setStatus("Messages unavailable.")); }, [channelId]);

  async function chooseProvider(providerId: string) {
    if (!channel) return;
    setBusy(true);
    try { await selectProvider(channel.id, providerId || null); await reload(); }
    catch { setStatus("Could not update the selected provider."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = content.trim();
    if (!channel || !value || busy) return;
    setBusy(true); setStatus("Generating response…"); setContent("");
    try { await sendAndRun(channel.id, value); setMessages(await loadMessages(channel.id)); setStatus("Ready"); }
    catch { setContent(value); setStatus("The assistant could not complete this run."); }
    finally { setBusy(false); }
  }

  return <SurfaceCard className="agent-surface">
    <div className="surface-header"><div><small>assistant</small><h2>Agent AI</h2></div><Badge>{channel?.title ?? "General"}</Badge></div>
    <label className="message">Provider connection
      <select value={channel?.providerId ?? ""} disabled={!channel || busy} onChange={(event) => void chooseProvider(event.target.value)}>
        <option value="">Select provider</option>
        {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.title} · {provider.model}</option>)}
      </select>
    </label>
    <div className="agent-messages">{messages.length ? messages.map((message) => <p key={message.id} data-role={message.role}>{message.content}</p>) : <p className="message">Start a conversation in this channel.</p>}</div>
    <form className="composer" onSubmit={submit}><input aria-label="Agent AI message" placeholder="Ask Agent AI…" value={content} onChange={(event) => setContent(event.target.value)} disabled={!channel || busy} /><Button type="submit" disabled={!channel?.providerId || busy}>{busy ? "Working…" : "Send"}</Button></form>
    <small>{status}</small>
  </SurfaceCard>;
}
