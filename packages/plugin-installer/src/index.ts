import { strFromU8, unzipSync } from "fflate";
import { pluginBundleSchema, pluginPackageDescriptorSchema, type PluginBundle } from "@v2/plugin-contracts";

export type InstallAssessment = { bundle: PluginBundle; requiresApproval: boolean; sensitiveCapabilities: string[] };

export function assessPluginBundle(input: unknown): InstallAssessment {
  const bundle = pluginBundleSchema.parse(input);
  const sensitiveCapabilities = bundle.manifest.capabilities
    .filter((item) => item.risk === "sensitive" || item.risk === "dangerous")
    .map((item) => item.id);
  const requiresApproval = sensitiveCapabilities.length > 0
    || bundle.manifest.data.mode === "dedicated"
    || bundle.worker.isolation === "platform-worker"
    || bundle.ui.mode === "sandbox-frame";
  return { bundle, sensitiveCapabilities, requiresApproval };
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function unpackPluginZip(bytes: ArrayBuffer, objectKey: string): Promise<InstallAssessment> {
  const entries = unzipSync(new Uint8Array(bytes));
  const definition = entries["plugin.json"];
  if (!definition) throw new Error("ZIP plugin package must include plugin.json at the archive root");
  const descriptor = pluginPackageDescriptorSchema.parse(JSON.parse(strFromU8(definition)));
  return assessPluginBundle({ ...descriptor, package: { format: "zip", sha256: await sha256Hex(bytes), sizeBytes: bytes.byteLength, objectKey } });
}

export function extractDeclaredHtmlAsset(bytes: ArrayBuffer, entry: string): string | undefined {
  if (!/^ui\/[a-zA-Z0-9/_-]+\.html$/.test(entry)) return undefined;
  const asset = unzipSync(new Uint8Array(bytes))[entry];
  return asset ? strFromU8(asset) : undefined;
}
