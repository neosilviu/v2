import { definePlugin } from "@v2/plugin-sdk";
export const themeStudioPlugin = definePlugin({
  id: "theme-studio", name: "Theme Studio", version: "0.1.0", builtIn: true,
  data: { mode: "platform", scopes: ["themes", "layouts", "settings"] }, capabilities: [{ id: "themes.write", description: "Edit workspace themes", risk: "reversible" }],
  contributes: {
    surfaces: [{ id: "theme-studio.appearance-settings", title: "Appearance", zone: "settings.appearance", kind: "settings" }],
    settings: [{ id: "theme-studio.tokens", title: "Appearance", section: "appearance", fields: [{ key: "accent", label: "Accent", type: "color" }, { key: "density", label: "Density", type: "select", options: ["compact", "comfortable"] }] }],
    tools: [{ id: "theme.preview", title: "Preview theme tokens", risk: "safe", exposure: ["agent-ai", "mcp", "command"] }, { id: "theme.save", title: "Save workspace theme", permissions: ["themes.write"], risk: "reversible", exposure: ["agent-ai", "mcp", "command"] }]
  }
});
