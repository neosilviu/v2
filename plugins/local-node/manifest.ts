import { definePlugin } from "@v2/plugin-sdk";

export const localNodeManifest = definePlugin({
  id: "local-node",
  name: "Local Node",
  version: "0.1.0",
  builtIn: true,
  data: { mode: "dedicated", resources: [] },
  capabilities: [
    {
      id: "localnode.read",
      description: "Read local runner health and module status",
      risk: "safe",
    },
    {
      id: "localnode.configure",
      description: "Configure runner endpoint and pairing metadata",
      risk: "sensitive",
    },
    {
      id: "localnode.execute",
      description: "Execute approved local runner commands",
      risk: "dangerous",
    },
  ],
  api: {
    version: 1,
    operations: [
      {
        id: "localnode.health",
        title: "Check Local Node health",
        permission: "localnode.read",
        risk: "safe",
        input: { type: "object", properties: {}, additionalProperties: false },
        output: {
          type: "object",
          properties: {
            health: {
              type: "object",
              properties: {
                status: { type: "string" },
                runnerVersion: { type: "string" },
                paired: { type: "boolean" },
                checkedAt: { type: "string" },
              },
              required: ["status", "runnerVersion", "paired", "checkedAt"],
              additionalProperties: true,
            },
          },
          required: ["health"],
          additionalProperties: false,
        },
      },
      {
        id: "localnode.saveConfig",
        title: "Save Local Node runner config",
        permission: "localnode.configure",
        risk: "sensitive",
        input: {
          type: "object",
          properties: {
            runnerBaseUrl: { type: "string" },
            mockMode: { type: "boolean" },
            pairingState: { type: "string" },
          },
          required: ["runnerBaseUrl"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: {
            status: { type: "string" },
            saved: { type: "boolean" },
          },
          required: ["status", "saved"],
          additionalProperties: false,
        },
      },
      {
        id: "localnode.executeCommand",
        title: "Execute Local Node command",
        permission: "localnode.execute",
        risk: "dangerous",
        input: {
          type: "object",
          properties: {
            kind: { type: "string" },
            input: { type: "unknown" },
          },
          required: ["kind"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: {
            result: { type: "unknown" },
            health: { type: "unknown" },
          },
          additionalProperties: false,
        },
      },
    ],
  },
  contributes: {
    settingsTabs: [
      {
        id: "local-node.settings",
        pluginId: "local-node",
        label: "Local Node",
        icon: "server",
        displayOrder: 160,
        category: "plugin",
        requiredPermission: "localnode.configure",
        panelContributionId: "local-node.settings.panel",
        status: "active",
      },
    ],
    settingsPanels: [
      {
        id: "local-node.settings.panel",
        pluginId: "local-node",
        tabId: "local-node.settings",
        templateId: "admin.settings",
        requiredPermission: "localnode.configure",
        schema: {
          id: "local-node.settings.panel",
          title: "Local Node",
          templateId: "admin.settings",
          access: "permission-gated",
          fields: [
            { id: "runnerBaseUrl", label: "Runner base URL", type: "text" },
            {
              id: "pairingState",
              label: "Pairing state",
              type: "text",
              readOnly: true,
            },
            { id: "mockMode", label: "Development mock mode", type: "boolean" },
          ],
          data: {
            runnerBaseUrl: "http://localhost:8799",
            pairingState: "unpaired",
            mockMode: true,
          },
          actions: [
            {
              id: "local-node.health",
              title: "Check health",
              commandId: "localnode.health",
              intent: "execute",
              variant: "primary",
              access: "permission-gated",
            },
            {
              id: "local-node.save",
              title: "Save runner config",
              commandId: "localnode.saveConfig",
              intent: "submit",
              variant: "primary",
              access: "permission-gated",
              risk: "sensitive",
            },
          ],
          slots: [
            {
              id: "local-node.settings.header",
              slot: "header",
              blocks: [
                {
                  type: "text",
                  text: "Local Node connects this workspace to a separately installed runner. This slice exposes configuration and health boundaries only.",
                  tone: "muted",
                },
                {
                  type: "metric",
                  label: "Runner",
                  value: "Mock/dev optional",
                  detail:
                    "Print, Gmail channels and WhatsApp channels require external credentials and hardware before real use.",
                },
              ],
            },
          ],
        },
      },
    ],
    surfaces: [
      {
        id: "local-node.production-status",
        title: "Local Production",
        zone: "workspace.main",
        kind: "page",
        renderer: {
          mode: "declarative",
          schema: {
            id: "local-node.production-status",
            title: "Local Production",
            templateId: "admin.table",
            access: "private",
            columns: [
              { id: "module", label: "Module", field: "module" },
              { id: "status", label: "Status", field: "status", type: "badge" },
              { id: "detail", label: "Detail", field: "detail" },
            ],
            data: {
              rows: [
                {
                  module: "Runner",
                  status: "not-configured",
                  detail: "Set runner URL and pair from Settings > Local Node.",
                },
                {
                  module: "Print Center",
                  status: "not-configured",
                  detail: "Real printers require runner and OS configuration.",
                },
                {
                  module: "Gmail channel",
                  status: "not-configured",
                  detail:
                    "Customer inbox, threads, attachments and replies belong to the Local Node Runner, not Core transactional mail.",
                },
                {
                  module: "WhatsApp",
                  status: "not-configured",
                  detail:
                    "Session pairing is intentionally outside this slice.",
                },
              ],
            },
            actions: [
              {
                id: "local-node.production.refresh",
                title: "Refresh status",
                commandId: "localnode.health",
                variant: "primary",
              },
            ],
            slots: [
              {
                id: "local-node.production.header",
                slot: "header",
                blocks: [
                  {
                    type: "text",
                    text: "Operational state is explicit: configured, not-configured, mock-development-only or unavailable.",
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
        id: "localnode.health",
        title: "Check Local Node health",
        permissions: ["localnode.read"],
        risk: "safe",
        exposure: ["agent-ai", "mcp", "command"],
      },
      {
        id: "localnode.saveConfig",
        title: "Save Local Node runner config",
        permissions: ["localnode.configure"],
        risk: "sensitive",
        exposure: ["agent-ai", "mcp", "command"],
      },
      {
        id: "localnode.executeCommand",
        title: "Execute Local Node command",
        permissions: ["localnode.execute"],
        risk: "dangerous",
        exposure: ["agent-ai", "mcp"],
      },
    ],
  },
});
