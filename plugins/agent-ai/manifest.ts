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
  contributes: {
    channels: [{ id: "general", title: "General", tools: ["runtime.*"], providers: [] }],
    surfaces: [{ id: "agent-ai.assistant-panel", title: "Assistant", zone: "assistant.right", kind: "panel" }],
    tools: [
      { id: "agent.sendMessage", title: "Send message", risk: "safe", exposure: ["agent-ai", "mcp"] },
      { id: "agent.executeTool", title: "Execute approved tool", risk: "sensitive", exposure: ["agent-ai", "mcp"] },
      { id: "agent.searchHelp", title: "Search help knowledge", risk: "safe", exposure: ["agent-ai", "mcp"] }
    ]
  }
});
