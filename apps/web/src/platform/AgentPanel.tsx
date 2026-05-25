import { useEffect, useState, type FormEvent } from "react";
import type { AgentChannel, AgentMessage } from "@v2/agent-contracts";
import { Badge, Button } from "@v2/ui-kit";
import { loadChannels, loadMessages, sendMessage } from "../api";

export function AgentPanel({ title }: { title: string }) {
  const [channels, setChannels] = useState<AgentChannel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [text, setText] = useState("");
  useEffect(() => { void loadChannels().then((items) => { setChannels(items); setActiveId(items[0]?.id ?? null); }).catch(() => undefined); }, []);
  useEffect(() => { if (activeId) void loadMessages(activeId).then(setMessages).catch(() => undefined); }, [activeId]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeId || !text.trim()) return;
    const message = await sendMessage(activeId, text.trim());
    setMessages((current) => [...current, message]);
    setText("");
  };
  return <div className="chat">
    <div className="chat-header"><strong>{title}</strong><Badge>{channels.find((channel) => channel.id === activeId)?.title ?? "#general"}</Badge></div>
    <div className="channel-tabs">{channels.map((channel) => <button key={channel.id} className={activeId === channel.id ? "active" : ""} onClick={() => setActiveId(channel.id)}>#{channel.title.toLowerCase()}</button>)}</div>
    <div className="chat-messages">{messages.length ? messages.map((message) => <div className={`chat-message ${message.role}`} key={message.id}>{message.content}</div>) : <div className="message">I can operate active workspace tools after permission checks.</div>}</div>
    <form className="composer" onSubmit={(event) => void submit(event)}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask Agent AI…" /><Button type="submit">Send</Button></form>
  </div>;
}
