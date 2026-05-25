export type ToolContribution = {
  id: string;
  title: string;
  description?: string;
  permissions: string[];
  risk: "safe" | "reversible" | "sensitive" | "dangerous";
  exposure: ("agent-ai" | "mcp" | "command")[];
};
