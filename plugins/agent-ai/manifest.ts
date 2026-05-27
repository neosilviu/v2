import { definePlugin } from "@v2/plugin-sdk";

export const agentAiManifest = definePlugin({
  id: "agent-ai",
  name: "Agent AI",
  version: "0.1.0",
  builtIn: true,
  data: { mode: "dedicated", resources: ["d1", "kv", "do", "r2", "vectorize"] },
  capabilities: [
    { id: "agent.channels", description: "Manage AI chat channels", risk: "safe" },
    { id: "agent.runs", description: "Manage AI runs and responses", risk: "safe" },
    { id: "agent.tools.execute", description: "Execute approved tools", risk: "sensitive" },
    { id: "agent.knowledge.query", description: "Query approved help and site knowledge", risk: "safe" }
  ],
  api: {
    version: 1,
    operations: [
      {
        id: "agent.sendMessage",
        title: "Send message",
        permission: "agent.channels",
        risk: "safe",
        input: {
          type: "object",
          properties: {
            workspaceId: { type: "string" },
            channelId: { type: "string" },
            content: { type: "string" },
          },
          required: ["channelId", "content"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: {
            message: { type: "unknown" },
            run: { type: "unknown" },
            toolCall: { type: "unknown" },
            status: { type: "string" },
          },
          required: ["message", "status"],
          additionalProperties: false,
        },
      },
    ],
  },
  contributes: {
    channels: [{ id: "general", title: "General", tools: ["runtime.*"], providers: [] }],
    surfaces: [{ id: "agent-ai.assistant-panel", title: "Assistant", zone: "assistant.right", kind: "panel", renderer: { mode: "declarative", schema: {
      id: "agent-ai.chat",
      title: "Assistant",
      templateId: "admin.chat",
      access: "private",
      data: { rows: [{ role: "system", title: "Runtime assistant", content: "Agent AI chat is exposed through a generic admin.chat template. Provider execution and tool approval stay server-side." }] },
      actions: [{ id: "agent-ai.chat.send", title: "Send message", commandId: "agent.sendMessage", variant: "primary" }],
      slots: [{ id: "agent-ai.chat.header", slot: "header", blocks: [{ type: "text", text: "Workspace assistant runtime", tone: "accent" }] }]
    } } }],
    tools: [
      { id: "agent.sendMessage", title: "Send message", risk: "safe", exposure: ["agent-ai", "mcp"] },
      { id: "agent.executeTool", title: "Execute approved tool", risk: "sensitive", exposure: ["agent-ai", "mcp"] },
      { id: "agent.searchHelp", title: "Search help knowledge", risk: "safe", exposure: ["agent-ai", "mcp"] }
    ]
  }
});
