import { pluginBundleSchema, type PluginBundle } from "@v2/plugin-contracts";

export type InstallAssessment = {
  bundle: PluginBundle;
  requiresApproval: boolean;
  sensitiveCapabilities: string[];
};

export function assessPluginBundle(input: unknown): InstallAssessment {
  const bundle = pluginBundleSchema.parse(input);
  const sensitiveCapabilities = bundle.manifest.capabilities
    .filter((capability) => capability.risk === "sensitive" || capability.risk === "dangerous")
    .map((capability) => capability.id);
  const requestsDedicatedResources = bundle.manifest.data.mode === "dedicated";
  const runsExternalCode = bundle.worker.isolation === "platform-worker" || bundle.ui.mode === "module";
  return {
    bundle,
    sensitiveCapabilities,
    requiresApproval: sensitiveCapabilities.length > 0 || requestsDedicatedResources || runsExternalCode,
  };
}
