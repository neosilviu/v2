import { strFromU8, unzipSync } from "fflate";

type JsonObject = Record<string, unknown>;

export type Risk = "safe" | "reversible" | "sensitive" | "dangerous";
export type Resource = "d1" | "kv" | "do" | "r2" | "vectorize" | "queues";
export type Exposure = "agent-ai" | "mcp" | "command";
export type ProviderAdapter = "cloudflare-workers-ai" | "openai" | "gemini" | "groq" | "github-models" | "openai-compatible";
export type CapabilityDeclaration = { id: string; description?: string; risk: Risk };
export type PluginDataMode =
  | { mode: "none" }
  | { mode: "platform"; scopes: string[] }
  | { mode: "namespaced" }
  | { mode: "dedicated"; resources: Resource[] };
export type ToolContribution = {
  id: string;
  title: string;
  description?: string;
  permissions: string[];
  risk: Risk;
  exposure: Exposure[];
};
export type ProviderModel = { id: string; title: string; capabilities: string[] };
export type ProviderSecretField = { id: string; title: string; required: boolean; secret: boolean };
export type ProviderContribution = {
  id: string;
  title: string;
  description?: string;
  adapter: ProviderAdapter;
  enabled: boolean;
  capabilities: string[];
  models: ProviderModel[];
  secretFields: ProviderSecretField[];
};
export type ChannelContribution = { id: string; title: string; tools: string[]; providers: string[] };
export type SurfaceContribution = { id: string; title: string; zone: string; kind: "panel" | "settings" | "widget" | "page" };
export type ZoneContribution = { id: string; title: string; accepts: string[] };
export type LayoutContribution = { id: string; title: string; zones: string[] };
export type SettingField = { key: string; label: string; type: "string" | "boolean" | "number" | "color" | "select"; options?: string[] };
export type SettingContribution = { id: string; title: string; section: string; fields: SettingField[] };
export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  builtIn: boolean;
  data: PluginDataMode;
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
export type InstallAssessment = { bundle: PluginBundle; requiresApproval: boolean; sensitiveCapabilities: string[] };

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, label);
}

function asStringArray(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`${label} must be a string array`);
  return value;
}

function parseResources(value: unknown): Resource[] {
  const resources = asStringArray(value, "manifest.data.resources");
  const parsed: Resource[] = [];
  for (const resource of resources) {
    if (resource !== "d1" && resource !== "kv" && resource !== "do" && resource !== "r2" && resource !== "vectorize" && resource !== "queues") {
      throw new Error("manifest.data.resources contains an unsupported resource");
    }
    parsed.push(resource);
  }
  return parsed;
}

function parseExposureArray(value: unknown, label: string): Exposure[] {
  const exposures = asStringArray(value, label);
  const parsed: Exposure[] = [];
  for (const exposure of exposures) {
    if (exposure !== "agent-ai" && exposure !== "mcp" && exposure !== "command") throw new Error(`${label} contains an unsupported exposure`);
    parsed.push(exposure);
  }
  return parsed;
}

function parseRisk(value: unknown): Risk {
  if (value === undefined) return "safe";
  if (value === "safe" || value === "reversible" || value === "sensitive" || value === "dangerous") return value;
  throw new Error("capability/tool risk must be safe, reversible, sensitive or dangerous");
}

function parseData(value: unknown): PluginDataMode {
  if (value === undefined) return { mode: "none" };
  const data = asObject(value, "manifest.data");
  const mode = data.mode;
  if (mode === "none") return { mode };
  if (mode === "platform") return { mode, scopes: asStringArray(data.scopes, "manifest.data.scopes") };
  if (mode === "namespaced") return { mode };
  if (mode === "dedicated") return { mode, resources: parseResources(data.resources) };
  throw new Error("manifest.data.mode is not supported");
}

function parseCapabilities(value: unknown): CapabilityDeclaration[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("manifest.capabilities must be an array");
  return value.map((item, index) => {
    const capability = asObject(item, `manifest.capabilities[${index}]`);
    const description = optionalString(capability.description, `manifest.capabilities[${index}].description`);
    return {
      id: asString(capability.id, `manifest.capabilities[${index}].id`),
      ...(description === undefined ? {} : { description }),
      risk: parseRisk(capability.risk),
    };
  });
}

function parseTools(value: unknown): ToolContribution[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("manifest.contributes.tools must be an array");
  return value.map((item, index) => {
    const tool = asObject(item, `manifest.contributes.tools[${index}]`);
    const description = optionalString(tool.description, `manifest.contributes.tools[${index}].description`);
    return {
      id: asString(tool.id, `manifest.contributes.tools[${index}].id`),
      title: asString(tool.title, `manifest.contributes.tools[${index}].title`),
      ...(description === undefined ? {} : { description }),
      permissions: asStringArray(tool.permissions, `manifest.contributes.tools[${index}].permissions`),
      risk: parseRisk(tool.risk),
      exposure: tool.exposure === undefined ? ["agent-ai"] : parseExposureArray(tool.exposure, `manifest.contributes.tools[${index}].exposure`),
    };
  });
}

function parseObjectArray(value: unknown, label: string): JsonObject[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => asObject(item, `${label}[${index}]`));
}

function parseProviders(value: unknown): ProviderContribution[] {
  return parseObjectArray(value, "manifest.contributes.providers").map((provider, index) => {
    const adapter = provider.adapter;
    if (adapter !== "cloudflare-workers-ai" && adapter !== "openai" && adapter !== "gemini" && adapter !== "groq" && adapter !== "github-models" && adapter !== "openai-compatible") {
      throw new Error(`manifest.contributes.providers[${index}].adapter is not supported`);
    }
    const description = optionalString(provider.description, `manifest.contributes.providers[${index}].description`);
    return {
      id: asString(provider.id, `manifest.contributes.providers[${index}].id`),
      title: asString(provider.title, `manifest.contributes.providers[${index}].title`),
      ...(description === undefined ? {} : { description }),
      adapter,
      enabled: typeof provider.enabled === "boolean" ? provider.enabled : false,
      capabilities: provider.capabilities === undefined ? ["chat"] : asStringArray(provider.capabilities, `manifest.contributes.providers[${index}].capabilities`),
      models: parseObjectArray(provider.models, `manifest.contributes.providers[${index}].models`).map((model, modelIndex) => ({
        id: asString(model.id, `manifest.contributes.providers[${index}].models[${modelIndex}].id`),
        title: asString(model.title, `manifest.contributes.providers[${index}].models[${modelIndex}].title`),
        capabilities: model.capabilities === undefined ? ["chat"] : asStringArray(model.capabilities, `manifest.contributes.providers[${index}].models[${modelIndex}].capabilities`),
      })),
      secretFields: parseObjectArray(provider.secretFields, `manifest.contributes.providers[${index}].secretFields`).map((field, fieldIndex) => ({
        id: asString(field.id, `manifest.contributes.providers[${index}].secretFields[${fieldIndex}].id`),
        title: asString(field.title, `manifest.contributes.providers[${index}].secretFields[${fieldIndex}].title`),
        required: typeof field.required === "boolean" ? field.required : true,
        secret: typeof field.secret === "boolean" ? field.secret : true,
      })),
    };
  });
}

function parseChannels(value: unknown): ChannelContribution[] {
  return parseObjectArray(value, "manifest.contributes.channels").map((channel, index) => ({
    id: asString(channel.id, `manifest.contributes.channels[${index}].id`),
    title: asString(channel.title, `manifest.contributes.channels[${index}].title`),
    tools: asStringArray(channel.tools, `manifest.contributes.channels[${index}].tools`),
    providers: asStringArray(channel.providers, `manifest.contributes.channels[${index}].providers`),
  }));
}

function parseSurfaceKind(value: unknown): SurfaceContribution["kind"] {
  if (value === undefined) return "panel";
  if (value === "panel" || value === "settings" || value === "widget" || value === "page") return value;
  throw new Error("manifest.contributes.surfaces.kind is not supported");
}

function parseSurfaces(value: unknown): SurfaceContribution[] {
  return parseObjectArray(value, "manifest.contributes.surfaces").map((surface, index) => ({
    id: asString(surface.id, `manifest.contributes.surfaces[${index}].id`),
    title: asString(surface.title, `manifest.contributes.surfaces[${index}].title`),
    zone: asString(surface.zone, `manifest.contributes.surfaces[${index}].zone`),
    kind: parseSurfaceKind(surface.kind),
  }));
}

function parseZones(value: unknown): ZoneContribution[] {
  return parseObjectArray(value, "manifest.contributes.zones").map((zone, index) => ({
    id: asString(zone.id, `manifest.contributes.zones[${index}].id`),
    title: asString(zone.title, `manifest.contributes.zones[${index}].title`),
    accepts: zone.accepts === undefined ? ["panel", "settings", "widget", "page"] : asStringArray(zone.accepts, `manifest.contributes.zones[${index}].accepts`),
  }));
}

function parseLayouts(value: unknown): LayoutContribution[] {
  return parseObjectArray(value, "manifest.contributes.layouts").map((layout, index) => ({
    id: asString(layout.id, `manifest.contributes.layouts[${index}].id`),
    title: asString(layout.title, `manifest.contributes.layouts[${index}].title`),
    zones: asStringArray(layout.zones, `manifest.contributes.layouts[${index}].zones`),
  }));
}

function parseFieldType(value: unknown): SettingField["type"] {
  if (value === "string" || value === "boolean" || value === "number" || value === "color" || value === "select") return value;
  throw new Error("manifest.contributes.settings.fields.type is not supported");
}

function parseSettings(value: unknown): SettingContribution[] {
  return parseObjectArray(value, "manifest.contributes.settings").map((setting, index) => ({
    id: asString(setting.id, `manifest.contributes.settings[${index}].id`),
    title: asString(setting.title, `manifest.contributes.settings[${index}].title`),
    section: asString(setting.section, `manifest.contributes.settings[${index}].section`),
    fields: parseObjectArray(setting.fields, `manifest.contributes.settings[${index}].fields`).map((field, fieldIndex) => {
      const options = field.options === undefined ? undefined : asStringArray(field.options, `manifest.contributes.settings[${index}].fields[${fieldIndex}].options`);
      return {
        key: asString(field.key, `manifest.contributes.settings[${index}].fields[${fieldIndex}].key`),
        label: asString(field.label, `manifest.contributes.settings[${index}].fields[${fieldIndex}].label`),
        type: parseFieldType(field.type),
        ...(options === undefined ? {} : { options }),
      };
    }),
  }));
}

export function parsePluginManifest(input: unknown): PluginManifest {
  const manifest = asObject(input, "manifest");
  const contributes = manifest.contributes === undefined ? {} : asObject(manifest.contributes, "manifest.contributes");
  return {
    id: asString(manifest.id, "manifest.id"),
    name: asString(manifest.name, "manifest.name"),
    version: asString(manifest.version, "manifest.version"),
    builtIn: typeof manifest.builtIn === "boolean" ? manifest.builtIn : false,
    data: parseData(manifest.data),
    capabilities: parseCapabilities(manifest.capabilities),
    contributes: {
      tools: parseTools(contributes.tools),
      providers: parseProviders(contributes.providers),
      channels: parseChannels(contributes.channels),
      surfaces: parseSurfaces(contributes.surfaces),
      zones: parseZones(contributes.zones),
      layouts: parseLayouts(contributes.layouts),
      settings: parseSettings(contributes.settings),
    },
  };
}

export function assessPluginBundle(input: unknown): InstallAssessment {
  const raw = asObject(input, "bundle");
  const manifest = parsePluginManifest(raw.manifest);
  const worker = raw.worker === undefined ? {} : asObject(raw.worker, "bundle.worker");
  const ui = raw.ui === undefined ? {} : asObject(raw.ui, "bundle.ui");
  const packageMetadata = asObject(raw.package, "bundle.package");
  const isolation = worker.isolation === undefined ? "none" : worker.isolation;
  const uiMode = ui.mode === undefined ? "declarative" : ui.mode;
  if (isolation !== "none" && isolation !== "platform-worker") throw new Error("bundle.worker.isolation is not supported");
  if (uiMode !== "declarative" && uiMode !== "module") throw new Error("bundle.ui.mode is not supported");
  const sha256 = asString(packageMetadata.sha256, "bundle.package.sha256");
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("bundle.package.sha256 must be a SHA-256 hex digest");
  if (packageMetadata.format !== "zip") throw new Error("bundle.package.format must be zip");
  if (typeof packageMetadata.sizeBytes !== "number" || !Number.isInteger(packageMetadata.sizeBytes) || packageMetadata.sizeBytes <= 0) {
    throw new Error("bundle.package.sizeBytes must be a positive integer");
  }
  const workerEntry = optionalString(worker.entry, "bundle.worker.entry");
  const uiEntry = optionalString(ui.entry, "bundle.ui.entry");
  const bundle: PluginBundle = {
    manifest,
    worker: { ...(workerEntry === undefined ? {} : { entry: workerEntry }), isolation },
    ui: { mode: uiMode, ...(uiEntry === undefined ? {} : { entry: uiEntry }) },
    package: {
      format: "zip",
      sha256,
      sizeBytes: packageMetadata.sizeBytes,
      objectKey: asString(packageMetadata.objectKey, "bundle.package.objectKey"),
    },
  };
  const sensitiveCapabilities = manifest.capabilities.filter((item) => item.risk === "sensitive" || item.risk === "dangerous").map((item) => item.id);
  return {
    bundle,
    sensitiveCapabilities,
    requiresApproval: sensitiveCapabilities.length > 0 || manifest.data.mode === "dedicated" || isolation === "platform-worker" || uiMode === "module",
  };
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function unpackPluginZip(bytes: ArrayBuffer, objectKey: string): Promise<InstallAssessment> {
  const entries = unzipSync(new Uint8Array(bytes));
  const definition = entries["plugin.json"];
  if (!definition) throw new Error("ZIP plugin package must include plugin.json at the archive root");
  const descriptor = asObject(JSON.parse(strFromU8(definition)), "plugin.json");
  return assessPluginBundle({
    ...descriptor,
    package: { format: "zip", sha256: await sha256Hex(bytes), sizeBytes: bytes.byteLength, objectKey },
  });
}
