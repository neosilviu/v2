import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AgentChannel, AgentMessage, AgentProviderBinding, AgentToolCall } from "@v2/agent-contracts";
import type { ProviderConnection } from "@v2/provider-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { createProviderBinding, loadAvailableConnections, loadChannels, loadMessages, loadProviderBindings, loadToolCalls, refreshToolCall, selectProvider, sendAndRun, submitToolCall } from "./api";

const terminalToolStatuses = new Set(["completed", "denied", "failed"]);

function MessageList({ messages }: { messages: AgentMessage[] }) {
  if (!messages.length) return <p className="message">Start a conversation in this channel.</p>;
  return <div className="chat-messages">{messages.map((message) => <p key={message.id} className={`chat-message ${message.role}`}>{message.content}</p>)}</div>;
}

function ToolCallList({ toolCalls, busy, onRefresh }: { toolCalls: AgentToolCall[]; busy: boolean; onRefresh: (id: string) => void }) {
  if (!toolCalls.length) return <p className="message">No tool calls in this conversation.</p>;
  return <div className="plugin-list">{toolCalls.map((toolCall) => <div key={toolCall.id} className="plugin-row">
    <div>
      <strong>{toolCall.toolId}</strong>
      <small>{toolCall.approvalId ? `approval ${toolCall.approvalId.slice(0, 8)}` : `run ${toolCall.runId.slice(0, 8)}`}</small>
      {toolCall.error ? <small>{toolCall.error}</small> : null}
    </div>
    <div className="actions">
      <Badge>{toolCall.status}</Badge>
      {!terminalToolStatuses.has(toolCall.status) ? <Button type="button" disabled={busy} onClick={() => onRefresh(toolCall.id)}>Refresh</Button> : null}
    </div>
  </div>)}</div>;
}

function ToolCallComposer({ disabled, onSubmit }: { disabled: boolean; onSubmit: (toolId: string, input: unknown) => Promise<void> }) {
  const [toolId, setToolId] = useState("agent.executeTool");
  const [inputJson, setInputJson] = useState("{\n  \"source\": \"agent-ai\"\n}");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(inputJson) as unknown;
    } catch {
      setError("Tool input must be valid JSON.");
      return;
    }
    setError(null);
    await onSubmit(toolId.trim(), parsed);
  }
  return <form className="plugin-list" onSubmit={submit}>
    <div className="surface-header"><div><small>development trigger</small><h2>Manual tool request</h2></div><Badge>test</Badge></div>
    <label className="field">Tool ID<input value={toolId} onChange={(event) => setToolId(event.target.value)} disabled={disabled} /></label>
    <label className="field">Input JSON<textarea value={inputJson} onChange={(event) => setInputJson(event.target.value)} disabled={disabled} rows={4} /></label>
    {error ? <p className="message">{error}</p> : null}
    <Button type="submit" disabled={disabled || !toolId.trim()}>Request test tool</Button>
  </form>;
}

export function AgentSurface() {
  const [channels, setChannels] = useState<AgentChannel[]>([]);
  const [providers, setProviders] = useState<AgentProviderBinding[]>([]);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [toolCalls, setToolCalls] = useState<AgentToolCall[]>([]);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Loading channels...");
  const [busy, setBusy] = useState(false);
  const channel = useMemo(() => channels.find((item) => item.id === channelId) ?? null, [channels, channelId]);

  async function reloadConversation(nextChannelId: string) {
    const [nextMessages, nextToolCalls] = await Promise.all([loadMessages(nextChannelId), loadToolCalls(nextChannelId)]);
    setMessages(nextMessages);
    setToolCalls(nextToolCalls);
  }

  async function reload() {
    const [nextChannels, nextProviders, nextConnections] = await Promise.all([loadChannels(), loadProviderBindings(), loadAvailableConnections()]);
    setChannels(nextChannels);
    setProviders(nextProviders);
    setConnections(nextConnections);
    const nextChannelId = channelId ?? nextChannels[0]?.id ?? null;
    setChannelId(nextChannelId);
    if (nextChannelId) await reloadConversation(nextChannelId);
    setStatus(nextConnections.length ? "Ready" : "Configure Workers AI in Integrations to start chatting.");
  }

  useEffect(() => { void reload().catch(() => setStatus("Agent AI service unavailable.")); }, []);
  useEffect(() => { if (channelId) void reloadConversation(channelId).catch(() => setStatus("Conversation unavailable.")); }, [channelId]);

  async function chooseProvider(value: string) {
    if (!channel) return;
    setBusy(true);
    try {
      let bindingId: string | null = value || null;
      if (value.startsWith("connection:")) {
        const connection = connections.find((item) => item.id === value.slice(11));
        if (!connection) throw new Error("Missing connection");
        bindingId = (await createProviderBinding(connection)).id;
      }
      await selectProvider(channel.id, bindingId);
      await reload();
    } catch {
      setStatus("Could not update the selected provider.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault();
    const value = content.trim();
    if (!channel || !value || busy) return;
    setBusy(true);
    setStatus("Generating response...");
    setContent("");
    try {
      await sendAndRun(channel.id, value);
      await reloadConversation(channel.id);
      setStatus("Ready");
    } catch {
      setContent(value);
      setStatus("The assistant could not complete this run.");
    } finally {
      setBusy(false);
    }
  }

  async function requestTool(toolId: string, input: unknown) {
    if (!channel || busy) return;
    setBusy(true);
    try {
      const toolCall = await submitToolCall(channel.id, toolId, input);
      setToolCalls((current) => [...current.filter((item) => item.id !== toolCall.id), toolCall]);
      setStatus(toolCall.status === "approval-required" ? "Tool call is pending Core approval." : "Tool call updated.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshTool(id: string) {
    if (!channel) return;
    setBusy(true);
    try {
      const toolCall = await refreshToolCall(id);
      setToolCalls((current) => current.map((item) => item.id === id ? toolCall : item));
      await reloadConversation(channel.id);
      setStatus(toolCall.status === "completed" ? "Tool call completed." : `Tool call ${toolCall.status}.`);
    } catch {
      setStatus("Tool call status could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }

  return <SurfaceCard className="agent-surface chat">
    <div className="surface-header"><div><small>assistant</small><h2>Agent AI</h2></div><Badge>{channel?.title ?? "General"}</Badge></div>
    <label className="provider-row"><select value={channel?.providerId ?? ""} disabled={!channel || busy} onChange={(event) => void chooseProvider(event.target.value)}>
      <option value="">Select provider</option>
      {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.title} · {provider.model}</option>)}
      {connections.filter((connection) => !providers.some((provider) => provider.connectionId === connection.id)).map((connection) => <option key={connection.id} value={`connection:${connection.id}`}>Link {connection.title}</option>)}
    </select></label>
    <MessageList messages={messages} />
    <form className="composer" onSubmit={submitMessage}><input aria-label="Agent AI message" placeholder="Ask Agent AI..." value={content} onChange={(event) => setContent(event.target.value)} disabled={!channel || busy} /><Button type="submit" disabled={!channel?.providerId || busy}>{busy ? "Working..." : "Send"}</Button></form>
    <div className="surface-header"><h2>Tool calls</h2><Badge>{toolCalls.length}</Badge></div>
    <ToolCallList toolCalls={toolCalls} busy={busy} onRefresh={(id) => void refreshTool(id)} />
    <ToolCallComposer disabled={!channel || busy} onSubmit={requestTool} />
    <small>{status}</small>
  </SurfaceCard>;
}
