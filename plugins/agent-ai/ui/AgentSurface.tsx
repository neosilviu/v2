import { useState, type FormEvent } from "react";

export type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};

export function AgentSurface({
  channel = "General",
  messages = [],
  onSend,
}: {
  channel?: string;
  messages?: AgentMessage[];
  onSend?: (content: string) => void;
}) {
  const [content, setContent] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = content.trim();
    if (!value) return;
    onSend?.(value);
    setContent("");
  };

  return <section className="agent-surface">
    <header><strong>Agent AI</strong><span>{channel}</span></header>
    <div className="agent-messages">
      {messages.map((message) => <p key={message.id} data-role={message.role}>{message.content}</p>)}
    </div>
    <form onSubmit={submit}>
      <input aria-label="Agent AI message" value={content} onChange={(event) => setContent(event.target.value)} />
      <button type="submit">Send</button>
    </form>
  </section>;
}
