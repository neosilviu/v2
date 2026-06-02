import { definePlugin } from "@v2/plugin-sdk";

export const aiProvidersPlugin = definePlugin({
  id: "ai-providers",
  name: "AI Providers",
  version: "0.1.0",
  builtIn: true,
  data: { mode: "dedicated", resources: ["d1"] },
  capabilities: [
    {
      id: "providers.manage",
      description: "Discover models and test AI provider connections",
      risk: "sensitive",
    },
    {
      id: "providers.use",
      description: "Invoke configured AI provider connections",
      risk: "sensitive",
    },
  ],
  api: {
    version: 1,
    operations: [
      {
        id: "providers.listConnections",
        title: "List provider connections",
        permission: "providers.manage",
        risk: "safe",
        input: {
          type: "object",
          properties: { workspaceId: { type: "string" } },
          required: ["workspaceId"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: {
            connections: { type: "array", items: { type: "unknown" } },
          },
          required: ["connections"],
          additionalProperties: false,
        },
      },
      {
        id: "providers.detectModels",
        title: "Detect provider models",
        permission: "providers.manage",
        risk: "sensitive",
        input: {
          type: "object",
          properties: { connectionId: { type: "string" } },
          required: ["connectionId"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: { models: { type: "array", items: { type: "unknown" } } },
          required: ["models"],
          additionalProperties: false,
        },
      },
      {
        id: "providers.testConnection",
        title: "Test provider connection",
        permission: "providers.manage",
        risk: "sensitive",
        input: {
          type: "object",
          properties: {
            connectionId: { type: "string" },
            modelId: { type: "string" },
          },
          required: ["connectionId"],
          additionalProperties: false,
        },
        output: { type: "unknown" },
      },
      {
        id: "providers.addWorkersAiConnection",
        title: "Add Workers AI connection",
        permission: "providers.manage",
        risk: "reversible",
        input: {
          type: "object",
          properties: {
            workspaceId: { type: "string" },
            title: { type: "string" },
            modelId: { type: "string" },
          },
          required: ["workspaceId", "title"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: { connection: { type: "unknown" } },
          required: ["connection"],
          additionalProperties: false,
        },
      },
    ],
  },
  contributes: {
    providers: [
      {
        id: "cloudflare-workers-ai",
        title: "Cloudflare Workers AI",
        adapter: "cloudflare-workers-ai",
        enabled: true,
        description: "Cloudflare AI binding with optional account discovery.",
        capabilities: ["chat", "tool-use"],
        models: [
          {
            id: "@cf/meta/llama-3.1-8b-instruct",
            title: "Llama 3.1 8B Instruct",
            capabilities: ["chat"],
          },
        ],
        secretFields: [
          { id: "api_token", title: "API token", required: false },
          {
            id: "account_id",
            title: "Account ID",
            required: false,
            secret: false,
          },
        ],
      },
      {
        id: "openai",
        title: "OpenAI",
        adapter: "openai",
        description: "OpenAI models for chat and tools.",
        capabilities: ["chat", "tool-use", "vision"],
        models: [
          { id: "gpt-4o-mini", title: "GPT-4o mini", capabilities: ["chat"] },
        ],
        secretFields: [{ id: "api_key", title: "API key" }],
      },
      {
        id: "gemini",
        title: "Gemini",
        adapter: "gemini",
        description: "Google Gemini model catalog and generation.",
        capabilities: ["chat", "tool-use"],
        models: [
          {
            id: "gemini-1.5-flash",
            title: "Gemini 1.5 Flash",
            capabilities: ["chat"],
          },
        ],
        secretFields: [{ id: "api_key", title: "API key" }],
      },
      {
        id: "groq",
        title: "Groq",
        adapter: "groq",
        description: "Low latency OpenAI-compatible inference.",
        capabilities: ["chat", "fast"],
        models: [
          {
            id: "llama-3.1-8b-instant",
            title: "Llama 3.1 8B Instant",
            capabilities: ["chat", "fast"],
          },
        ],
        secretFields: [{ id: "api_key", title: "API key" }],
      },
      {
        id: "github",
        title: "GitHub Models",
        adapter: "github-models",
        description: "GitHub hosted model catalog.",
        capabilities: ["chat", "tool-use"],
        models: [
          { id: "gpt-4o-mini", title: "GPT-4o mini", capabilities: ["chat"] },
        ],
        secretFields: [{ id: "token", title: "Token" }],
      },
    ],
    surfaces: [
      {
        id: "ai-providers.settings",
        title: "AI Providers",
        zone: "settings.integrations",
        kind: "settings",
        renderer: {
          mode: "declarative",
          schema: {
            id: "ai-providers.settings",
            title: "AI Providers",
            templateId: "admin.table",
            access: "private",
            columns: [
              { id: "provider", label: "Provider", field: "provider" },
              { id: "adapter", label: "Adapter", field: "adapter" },
              { id: "status", label: "Status", field: "status", type: "badge" },
            ],
            data: {
              rows: [
                {
                  provider: "Cloudflare Workers AI",
                  adapter: "cloudflare-workers-ai",
                  status: "enabled",
                },
                {
                  provider: "OpenAI",
                  adapter: "openai",
                  status: "server-configured",
                },
                {
                  provider: "Gemini",
                  adapter: "gemini",
                  status: "server-configured",
                },
              ],
            },
            actions: [
              {
                id: "ai-providers.detect",
                title: "Detect models",
                commandId: "providers.detectModels",
                variant: "primary",
                access: "permission-gated",
              },
            ],
            slots: [
              {
                id: "ai-providers.settings.header",
                slot: "header",
                blocks: [
                  {
                    type: "text",
                    text: "Provider metadata is declarative. Secrets stay server-side.",
                    tone: "muted",
                  },
                ],
              },
            ],
          },
        },
      },
    ],
    tools: [
      {
        id: "providers.detectModels",
        title: "Detect provider models",
        permissions: ["providers.manage"],
        risk: "sensitive",
        exposure: ["agent-ai", "mcp", "command"],
      },
      {
        id: "providers.testConnection",
        title: "Test AI provider",
        permissions: ["providers.manage"],
        risk: "sensitive",
        exposure: ["agent-ai", "mcp", "command"],
      },
      {
        id: "providers.listConnections",
        title: "List provider connections",
        permissions: ["providers.manage"],
        risk: "safe",
        exposure: ["agent-ai", "command"],
      },
      {
        id: "providers.chat",
        title: "Invoke AI provider chat",
        permissions: ["providers.use"],
        risk: "sensitive",
        exposure: ["agent-ai"],
      },
      {
        id: "providers.addWorkersAiConnection",
        title: "Add Workers AI connection",
        permissions: ["providers.manage"],
        risk: "reversible",
        exposure: ["agent-ai", "command"],
      },
    ],
  },
});
