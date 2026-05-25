import { definePlugin } from "@v2/plugin-sdk";

export const websiteStudioManifest = definePlugin({
  id: "website-studio",
  name: "Website Studio",
  version: "0.1.0",
  builtIn: true,
  data: { mode: "dedicated", resources: ["d1", "kv", "r2"] },
  capabilities: [
    { id: "website.pages.read", description: "Read website page structure", risk: "safe" },
    { id: "website.pages.write", description: "Edit website pages and sections", risk: "reversible" },
    { id: "website.publish", description: "Publish website page changes", risk: "sensitive" },
    { id: "website.context.share", description: "Share approved page context with Agent AI", risk: "safe" }
  ],
  contributes: {
    surfaces: [{ id: "website-studio.editor", title: "Website Studio", zone: "workspace.main", kind: "page" }],
    tools: [
      { id: "website.listPages", title: "List pages", permissions: ["website.pages.read"], risk: "safe", exposure: ["agent-ai", "mcp", "command"] },
      { id: "website.updateSection", title: "Update section", permissions: ["website.pages.write"], risk: "reversible", exposure: ["agent-ai", "mcp", "command"] },
      { id: "website.publishPage", title: "Publish page", permissions: ["website.publish"], risk: "sensitive", exposure: ["agent-ai", "mcp", "command"] },
      { id: "website.readPageContext", title: "Read approved page context", permissions: ["website.context.share"], risk: "safe", exposure: ["agent-ai", "mcp"] }
    ]
  }
});
