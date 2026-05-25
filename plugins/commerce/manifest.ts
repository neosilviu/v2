import { definePlugin } from "@v2/plugin-sdk";

export const commerceManifest = definePlugin({
  id: "commerce",
  name: "Commerce",
  version: "0.1.0",
  builtIn: true,
  data: { mode: "dedicated", resources: ["d1", "kv", "r2"] },
  capabilities: [
    { id: "commerce.catalog.read", description: "Read catalog entries", risk: "safe" },
    { id: "commerce.catalog.write", description: "Edit products and variants", risk: "reversible" },
    { id: "commerce.orders.read", description: "Read permitted order status", risk: "sensitive" },
    { id: "commerce.orders.manage", description: "Manage orders", risk: "sensitive" }
  ],
  contributes: {
    surfaces: [{ id: "commerce.dashboard", title: "Commerce", zone: "workspace.main", kind: "page" }],
    tools: [
      { id: "commerce.listProducts", title: "List products", permissions: ["commerce.catalog.read"], risk: "safe", exposure: ["agent-ai", "mcp", "command"] },
      { id: "commerce.updateProduct", title: "Update product", permissions: ["commerce.catalog.write"], risk: "reversible", exposure: ["agent-ai", "mcp", "command"] },
      { id: "commerce.readOrder", title: "Read order status", permissions: ["commerce.orders.read"], risk: "sensitive", exposure: ["agent-ai", "mcp"] }
    ]
  }
});
