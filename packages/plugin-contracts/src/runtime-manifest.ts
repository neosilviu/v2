import { z } from "zod";
import { pluginApiContractSchema } from "./operation-contracts";
import { pluginBundleSchema, pluginManifestSchema, pluginPackageDescriptorSchema } from "./index";

export { pluginOperationRequestSchema, pluginOperationSchema, pluginValueContractSchema, validatePluginValue } from "./operation-contracts";
export type { PluginApiContract, PluginOperation, PluginValueContract } from "./operation-contracts";

export const runtimePluginManifestSchema = pluginManifestSchema.extend({
  api: pluginApiContractSchema.default({ version: 1, operations: [] }),
});

export const runtimePluginPackageDescriptorSchema = pluginPackageDescriptorSchema.extend({
  manifest: runtimePluginManifestSchema,
});

export const runtimePluginBundleSchema = pluginBundleSchema.extend({
  manifest: runtimePluginManifestSchema,
});

export type RuntimePluginManifestInput = z.input<typeof runtimePluginManifestSchema>;
export type RuntimePluginManifest = z.output<typeof runtimePluginManifestSchema>;
export type RuntimePluginBundle = z.output<typeof runtimePluginBundleSchema>;
