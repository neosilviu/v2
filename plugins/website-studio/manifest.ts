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
    settingsTabs: [{
      id: "website-studio.settings",
      pluginId: "website-studio",
      label: "Website",
      icon: "layout-template",
      displayOrder: 120,
      category: "plugin",
      requiredPermission: "website.pages.read",
      panelContributionId: "website-studio.settings.panel",
      status: "active"
    }],
    settingsPanels: [{
      id: "website-studio.settings.panel",
      pluginId: "website-studio",
      tabId: "website-studio.settings",
      templateId: "admin.table",
      requiredPermission: "website.pages.read",
      schema: {
        id: "website-studio.settings.panel",
        title: "Website Pages",
        templateId: "admin.table",
        access: "permission-gated",
        columns: [
          { id: "title", label: "Page", field: "title" },
          { id: "slug", label: "Slug", field: "slug" },
          { id: "status", label: "Status", field: "status", type: "badge" },
          { id: "updatedAt", label: "Updated", field: "updatedAt", type: "date" }
        ],
        data: { rows: [] },
        actions: [
          { id: "website-studio.pages.refresh", title: "List pages", commandId: "website.listPages", intent: "execute", variant: "primary", access: "permission-gated" },
          { id: "website-studio.demo.install", title: "Install demo pages", commandId: "website.installDemoData", intent: "execute", variant: "default", access: "permission-gated", risk: "reversible" }
        ],
        slots: [{ id: "website-studio.settings.header", slot: "header", blocks: [
          { type: "text", text: "Website Studio owns page composition, sections, assets and approved Agent AI context. Demo content is installed only when explicitly requested.", tone: "muted" }
        ] }]
      }
    }],
    surfaces: [{ id: "website-studio.editor", title: "Website Studio", zone: "workspace.main", kind: "page", renderer: { mode: "declarative", schema: {
      id: "website-studio.editor",
      title: "Website Studio",
      templateId: "admin.dashboard",
      access: "private",
      data: { rows: [
        { label: "Install state", value: "Plugin-owned", detail: "Page records and demo content live in Website Studio D1." },
        { label: "Public delivery", value: "Explicit publish", detail: "Core publication is required before public routes resolve." },
        { label: "Demo data", value: "Manual", detail: "Install from Marketplace/Website actions, never workspace bootstrap." }
      ] },
      slots: [
        { id: "website-studio.hero", slot: "header", blocks: [{ type: "heading", text: "Website Studio", level: "h1" }, { type: "text", text: "Build and publish workspace pages through plugin-owned data and generic platform publication.", tone: "muted" }] }
      ],
      actions: [
        { id: "website-studio.pages", title: "List pages", commandId: "website.listPages", variant: "primary", access: "permission-gated" },
        { id: "website-studio.publish", title: "Publish page", commandId: "website.publishPage", variant: "default", access: "permission-gated", risk: "sensitive" }
      ]
    } } }],
    publicRoutes: [
      { id: "website-studio.public.home", title: "Website home page", path: "/", surfaceId: "website-studio.editor", access: "anonymous" },
      { id: "website-studio.public.page", title: "Website content page", path: "/pages/:slug", surfaceId: "website-studio.editor", access: "anonymous" }
    ],
    tools: [
      { id: "website.listPages", title: "List pages", permissions: ["website.pages.read"], risk: "safe", exposure: ["agent-ai", "mcp", "command"] },
      { id: "website.updateSection", title: "Update section", permissions: ["website.pages.write"], risk: "reversible", exposure: ["agent-ai", "mcp", "command"] },
      { id: "website.publishPage", title: "Publish page", permissions: ["website.publish"], risk: "sensitive", exposure: ["agent-ai", "mcp", "command"] },
      { id: "website.installDefaults", title: "Install Website Studio defaults", permissions: ["website.pages.write"], risk: "reversible", exposure: ["command"] },
      { id: "website.installDemoData", title: "Install Website Studio demo data", permissions: ["website.pages.write"], risk: "reversible", exposure: ["command"] },
      { id: "website.readPageContext", title: "Read approved page context", permissions: ["website.context.share"], risk: "safe", exposure: ["agent-ai", "mcp"] }
    ]
  }
});
