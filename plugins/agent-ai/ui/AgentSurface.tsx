import { useState, type FormEvent } from "react";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";

export type AgentMessage = { id: string; role: "user" | "assistant" | "system" | "tool"; content: string };
export function AgentSurface({ channel = "General", messages = [], onSend }: { channel?: string; messages?: AgentMessage[]; onSend?: (content: string) => void }) {
  const [content, setContent] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); const value = content.trim(); if (!value) return; onSend?.(value); setContent(""); };
  return <SurfaceCard className="agent-surface"><div className="surface-header"><div><small>assistant</small><h2>Agent AI</h2></div><Badge>{channel}</Badge></div><div className="agent-messages">{messages.length ? messages.map((message) => <p key={message.id} data-role={message.role}>{message.content}</p>) : <p className="message">Start a conversation in this channel.</p>}</div><form className="composer" onSubmit={submit}><input aria-label="Agent AI message" placeholder="Ask Agent AI…" value={content} onChange={(event) => setContent(event.target.value)} /><Button type="submit">Send</Button></form></SurfaceCard>;
}
