import type { PluginManifest } from "@v2/plugin-contracts";
import type { InstallAssessment } from "@v2/plugin-installer";

export type PluginActivation = { workspaceId: string; pluginId: string; activatedAt: string };
export class PluginControlPlane {
  readonly #installed = new Map<string, PluginManifest>();
  readonly #activations = new Map<string, Set<string>>();
  readonly #packages = new Map<string, InstallAssessment>();
  install(manifest: PluginManifest) { this.#installed.set(manifest.id, manifest); return manifest; }
  installBundle(assessment: InstallAssessment) { this.#packages.set(assessment.bundle.manifest.id, assessment); return this.install(assessment.bundle.manifest); }
  activate(workspaceId: string, pluginId: string): PluginActivation {
    if (!this.#installed.has(pluginId)) throw new Error(`Plugin not installed: ${pluginId}`);
    const active = this.#activations.get(workspaceId) ?? new Set<string>(); active.add(pluginId); this.#activations.set(workspaceId, active);
    return { workspaceId, pluginId, activatedAt: new Date().toISOString() };
  }
  installed() { return [...this.#installed.values()]; }
  activeForWorkspace(workspaceId: string) { return [...(this.#activations.get(workspaceId) ?? [])]; }
}
