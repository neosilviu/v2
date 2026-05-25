import { definePlugin } from "@v2/plugin-sdk";

export const themeStudioPlugin = definePlugin({
  id: "theme-studio",
  name: "Theme Studio",
  version: "0.1.0",
  builtIn: true,
  data: { mode: "platform", scopes: ["themes", "layouts", "settings"] },
  capabilities: [{ id: "themes.write", description: "Edit workspace themes", risk: "reversible" }],
  contributes: {
    surfaces: [{ id: "theme-studio.appearance-settings", title: "Appearance", zone: "settings.appearance", kind: "settings" }],
    tools: [
      { id: "theme.preview", title: "Preview theme tokens", risk: "safe", exposure: ["agent-ai", "mcp", "command"] },
      { id: "theme.save", title: "Save workspace theme", permissions: ["themes.write"], risk: "reversible", exposure: ["agent-ai", "mcp", "command"] }
    ]
  }
});
