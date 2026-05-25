import { useEffect, useState, type FormEvent } from "react";
import type { AgentChannel, AgentMessage, AgentProviderBinding } from "@v2/agent-contracts";
import type { ProviderContribution } from "@v2/plugin-contracts";
import { Badge, Button } from "@v2/ui-kit";
import { bindProvider, createRun, loadChannels, loadMessages, loadProviderBindings, loadRuntimeProviders, sendMessage, setChannelProvider } from "../api";

export function AgentPanel({ title }: { title: string }) {
  const [channels, setChannels] = useState<AgentChannel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [available, setAvailable] = useState<ProviderContribution[]>([]);
  const [bindings, setBindings] = useState<AgentProviderBinding[]>([]);
  const [text, setText] = useState("");
  const activeChannel = channels.find((channel) => channel.id === activeId);
  useEffect(() => { void Promise.all([loadChannels(), loadRuntimeProviders(), loadProviderBindings()]).then(([items, providerContributions, providerBindings]) => { setChannels(items); setActiveId(items[0]?.id ?? null); setAvailable(providerContributions); setBindings(providerBindings); }).catch(() => undefined); }, []);
  useEffect(() => { if (activeId) void loadMessages(activeId).then(setMessages).catch(() => undefined); }, [activeId]);
  const chooseProvider = async (providerId: string) => {
    if (!activeId) return;
    await setChannelProvider(activeId, providerId || null);
    setChannels((items) => items.map((channel) => channel.id === activeId ? { ...channel, providerId: providerId || null } : channel));
  };
  const addFirstProvider = async () => {
    const contribution = available[0];
    const model = contribution?.models[0];
    if (!contribution || !model) return;
    const provider = await bindProvider(contribution, model);
    setBindings((items) => [...items, provider]);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeId || !text.trim()) return;
    const message = await sendMessage(activeId, text.trim());
    setMessages((current) => [...current, message]);
    setText("");
    const run = await createRun(activeId);
    if (run.status === "provider-required") setMessages((current) => [...current, { id: `notice.${run.id}`, channelId: activeId, role: "system", content: "Select a provider contributed by an active plugin before running the assistant.", createdAt: run.createdAt }]);
  };
  return <div className="chat">
    <div className="chat-header"><strong>{title}</strong><Badge>{activeChannel?.title ?? "#general"}</Badge></div>
    <div className="channel-tabs">{channels.map((channel) => <button key={channel.id} className={activeId === channel.id ? "active" : ""} onClick={() => setActiveId(channel.id)}>#{channel.title.toLowerCase()}</button>)}</div>
    <div className="provider-row">
      <select value={activeChannel?.providerId ?? ""} onChange={(event) => void chooseProvider(event.target.value)}><option value="">No provider</option>{bindings.map((provider) => <option key={provider.id} value={provider.id}>{provider.title} · {provider.model}</option>)}</select>
      <Button onClick={() => void addFirstProvider()} disabled={!available.length}>Add provider</Button>
    </div>
    <div className="chat-messages">{messages.length ? messages.map((message) => <div className={`chat-message ${message.role}`} key={message.id}>{message.content}</div>) : <div className="message">I can operate active workspace tools after permission checks.</div>}</div>
    <form className="composer" onSubmit={(event) => void submit(event)}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask Agent AI…" /><Button type="submit">Send</Button></form>
  </div>;
}
