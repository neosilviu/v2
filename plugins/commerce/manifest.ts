import { definePlugin } from "@v2/plugin-sdk";

export const commerceManifest = definePlugin({
  id: "commerce",
  name: "Commerce",
  version: "0.1.0",
  builtIn: true,
  data: { mode: "dedicated", resources: ["d1", "kv", "r2"] },
  capabilities: [
    {
      id: "commerce.catalog.read",
      description: "Read catalog entries",
      risk: "safe",
    },
    {
      id: "commerce.catalog.write",
      description: "Edit products and variants",
      risk: "reversible",
    },
    {
      id: "commerce.orders.read",
      description: "Read permitted order status",
      risk: "sensitive",
    },
    {
      id: "commerce.orders.manage",
      description: "Manage orders",
      risk: "sensitive",
    },
  ],
  api: {
    version: 1,
    operations: [
      {
        id: "commerce.listProducts",
        title: "List products",
        permission: "commerce.catalog.read",
        risk: "safe",
        input: { type: "object", properties: {}, additionalProperties: false },
        output: {
          type: "object",
          properties: {
            products: { type: "array", items: { type: "unknown" } },
          },
          required: ["products"],
          additionalProperties: false,
        },
      },
      {
        id: "commerce.readOrder",
        title: "Read order status",
        permission: "commerce.orders.read",
        risk: "sensitive",
        input: {
          type: "object",
          properties: { orderId: { type: "string" } },
          required: ["orderId"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: { order: { type: "unknown" } },
          required: ["order"],
          additionalProperties: false,
        },
      },
      {
        id: "commerce.updateProduct",
        title: "Update product",
        permission: "commerce.catalog.write",
        risk: "reversible",
        input: {
          type: "object",
          properties: {
            productId: { type: "string" },
            title: { type: "string" },
            status: { type: "string" },
            price: { type: "string" },
          },
          required: ["productId"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: { product: { type: "unknown" } },
          required: ["product"],
          additionalProperties: false,
        },
      },
    ],
  },
  contributes: {
    surfaces: [
      {
        id: "commerce.dashboard",
        title: "Commerce",
        zone: "workspace.main",
        kind: "page",
        renderer: {
          mode: "declarative",
          schema: {
            id: "commerce.products",
            title: "Commerce Products",
            templateId: "admin.table",
            access: "private",
            columns: [
              { id: "name", label: "Product", field: "name" },
              { id: "price", label: "Price", field: "price" },
              { id: "status", label: "Status", field: "status", type: "badge" },
            ],
            data: { rows: [] },
            actions: [
              {
                id: "commerce.products.refresh",
                title: "List products",
                commandId: "commerce.listProducts",
                variant: "primary",
              },
            ],
            slots: [
              {
                id: "commerce.products.header",
                slot: "header",
                blocks: [
                  {
                    type: "text",
                    text: "Catalog data is loaded from the Commerce runtime. Demo data is not installed by workspace bootstrap.",
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
        id: "commerce.listProducts",
        title: "List products",
        permissions: ["commerce.catalog.read"],
        risk: "safe",
        exposure: ["agent-ai", "mcp", "command"],
      },
      {
        id: "commerce.updateProduct",
        title: "Update product",
        permissions: ["commerce.catalog.write"],
        risk: "reversible",
        exposure: ["agent-ai", "mcp", "command"],
      },
      {
        id: "commerce.readOrder",
        title: "Read order status",
        permissions: ["commerce.orders.read"],
        risk: "sensitive",
        exposure: ["agent-ai", "mcp"],
      },
    ],
  },
});
