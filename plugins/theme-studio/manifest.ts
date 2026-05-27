import { definePlugin } from "@v2/plugin-sdk";

export const themeStudioPlugin = definePlugin({
  id: "theme-studio",
  name: "Theme Studio",
  version: "0.1.0",
  builtIn: true,
  data: { mode: "platform", scopes: ["themes", "layouts", "settings"] },
  capabilities: [{ id: "themes.write", description: "Edit workspace themes", risk: "reversible" }],
  api: {
    version: 1,
    operations: [
      {
        id: "theme.preview",
        title: "Preview theme tokens",
        permission: "themes.write",
        risk: "safe",
        input: { type: "object", properties: { workspaceId: { type: "string" }, accent: { type: "string" }, density: { type: "string" } }, required: ["workspaceId"], additionalProperties: false },
        output: { type: "object", properties: { preview: { type: "unknown" } }, required: ["preview"], additionalProperties: false },
      },
      {
        id: "theme.save",
        title: "Save workspace theme",
        permission: "themes.write",
        risk: "reversible",
        input: { type: "object", properties: { workspaceId: { type: "string" }, accent: { type: "string" }, density: { type: "string" } }, required: ["workspaceId"], additionalProperties: false },
        output: { type: "object", properties: { saved: { type: "boolean" } }, required: ["saved"], additionalProperties: false },
      },
    ],
  },
  contributes: {
    surfaces: [{
      id: "theme-studio.appearance-settings",
      title: "Appearance",
      zone: "settings.appearance",
      kind: "settings",
      renderer: { mode: "declarative", schema: {
        id: "theme-studio.settings",
        title: "Appearance",
        templateId: "admin.settings",
        access: "private",
        fields: [
          { id: "accent", label: "Accent", type: "color" },
          { id: "density", label: "Density", type: "select", options: [{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }] },
        ],
        actions: [{ id: "theme-studio.preview", title: "Preview theme", commandId: "theme.preview", variant: "primary" }],
        slots: [{ id: "theme-studio.settings.header", slot: "header", blocks: [
          { type: "text", text: "Workspace appearance controls are rendered from manifest schema.", tone: "muted" },
          { type: "metric", label: "Runtime UI", value: "Template", detail: "No Web rebuild is required for this surface shape." },
        ] }],
      } },
    }],
    settings: [{ id: "theme-studio.tokens", title: "Appearance", section: "appearance", fields: [{ key: "accent", label: "Accent", type: "color" }, { key: "density", label: "Density", type: "select", options: ["compact", "comfortable"] }] }],
    tools: [
      { id: "theme.preview", title: "Preview theme tokens", risk: "safe", exposure: ["agent-ai", "mcp", "command"] },
      { id: "theme.save", title: "Save workspace theme", permissions: ["themes.write"], risk: "reversible", exposure: ["agent-ai", "mcp", "command"] },
    ],
  },
});
