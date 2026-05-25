export type Risk = "safe" | "reversible" | "sensitive" | "dangerous";
export type Resource = "d1" | "kv" | "do" | "r2" | "vectorize" | "queues";
export type CapabilityDeclaration = { id: string; description?: string; risk: Risk };
export type ToolContribution = {
  id: string;
  title: string;
  description?: string;
  permissions: string[];
  risk: Risk;
  exposure: ("agent-ai" | "mcp" | "command")[];
};
export type ProviderContribution = {
  id: string;
  title: string;
  description?: string;
  adapter: "cloudflare-workers-ai" | "openai" | "gemini" | "groq" | "github-models" | "openai-compatible";
  enabled: boolean;
  capabilities: string[];
  models: { id: string; title: string; capabilities: string[] }[];
  secretFields: { id: string; title: string; required: boolean; secret: boolean }[];
};
export type ChannelContribution = { id: string; title: string; tools: string[]; providers: string[] };
export type SurfaceContribution = { id: string; title: string; zone: string; kind: "panel" | "settings" | "widget" | "page" };
export type ZoneContribution = { id: string; title: string; accepts: string[] };
export type LayoutContribution = { id: string; title: string; zones: string[] };
export type SettingContribution = {
  id: string;
  title: string;
  section: string;
  fields: { key: string; label: string; type: "string" | "boolean" | "number" | "color" | "select"; options?: string[] }[];
};
export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  builtIn: boolean;
  data:
    | { mode: "none" }
    | { mode: "platform"; scopes: string[] }
    | { mode: "namespaced" }
    | { mode: "dedicated"; resources: Resource[] };
  capabilities: CapabilityDeclaration[];
  contributes: {
    tools: ToolContribution[];
    providers: ProviderContribution[];
    channels: ChannelContribution[];
    surfaces: SurfaceContribution[];
    zones: ZoneContribution[];
    layouts: LayoutContribution[];
    settings: SettingContribution[];
  };
};
export type PluginBundle = {
  manifest: PluginManifest;
  worker: { entry?: string; isolation: "none" | "platform-worker" };
  ui: { mode: "declarative" | "module"; entry?: string };
  package: { format: "zip"; sha256: string; sizeBytes: number; objectKey: string };
};
