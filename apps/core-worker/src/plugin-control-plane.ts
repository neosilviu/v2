import type { PluginManifest } from "@v2/plugin-contracts";

export type PluginActivation = { workspaceId: string; pluginId: string; activatedAt: string };

export class PluginControlPlane {
  readonly #installed = new Map<string, PluginManifest>();
  readonly #activations = new Map<string, Set<string>>();

  install(manifest: PluginManifest): PluginManifest {
    this.#installed.set(manifest.id, manifest);
    return manifest;
  }

  activate(workspaceId: string, pluginId: string): PluginActivation {
    if (!this.#installed.has(pluginId)) throw new Error(`Plugin not installed: ${pluginId}`);
    const active = this.#activations.get(workspaceId) ?? new Set<string>();
    active.add(pluginId);
    this.#activations.set(workspaceId, active);
    return { workspaceId, pluginId, activatedAt: new Date().toISOString() };
  }

  installed(): PluginManifest[] {
    return [...this.#installed.values()];
  }

  activeForWorkspace(workspaceId: string): string[] {
    return [...(this.#activations.get(workspaceId) ?? [])];
  }
}
