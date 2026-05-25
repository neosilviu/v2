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
    surfaces: [{ id: "website-studio.editor", title: "Website Studio", zone: "workspace.main", kind: "page", renderer: { mode: "declarative", schema: {
      id: "website-studio.page-scaffold",
      title: "Website Page",
      templateId: "public.contentPage",
      access: "private",
      slots: [
        { id: "website-studio.hero", slot: "hero", blocks: [{ type: "heading", text: "Website Studio", level: "h1" }, { type: "text", text: "Public page scaffolds are declared by plugins and published explicitly per workspace.", tone: "muted" }] },
        { id: "website-studio.body", slot: "body", blocks: [{ type: "text", text: "This content page remains private until a workspace publication activates a public route.", tone: "default" }] }
      ],
      actions: [{ id: "website-studio.publish", title: "Publish page", commandId: "website.publishPage", variant: "primary", access: "permission-gated" }]
    } } }],
    tools: [
      { id: "website.listPages", title: "List pages", permissions: ["website.pages.read"], risk: "safe", exposure: ["agent-ai", "mcp", "command"] },
      { id: "website.updateSection", title: "Update section", permissions: ["website.pages.write"], risk: "reversible", exposure: ["agent-ai", "mcp", "command"] },
      { id: "website.publishPage", title: "Publish page", permissions: ["website.publish"], risk: "sensitive", exposure: ["agent-ai", "mcp", "command"] },
      { id: "website.readPageContext", title: "Read approved page context", permissions: ["website.context.share"], risk: "safe", exposure: ["agent-ai", "mcp"] }
    ]
  }
});
