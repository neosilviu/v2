import { useEffect, useRef, useState } from "react";
import type { PluginBundle, PluginManifest } from "@v2/plugin-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { activatePlugin, approveInstall, deactivatePlugin, grantCapabilities, loadActivePlugins, loadInstalledPlugins, uploadPlugin } from "../api";

export function PluginManagerPanel({ plugins: initialPlugins, activePluginIds, onChanged }: { plugins: PluginManifest[]; activePluginIds: Set<string>; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [active, setActive] = useState(activePluginIds);
  const [pendingBundle, setPendingBundle] = useState<PluginBundle | null>(null);
  const [uploadState, setUploadState] = useState("Upload a ZIP containing plugin.json");
  useEffect(() => { setPlugins(initialPlugins); }, [initialPlugins]);
  useEffect(() => { setActive(activePluginIds); }, [activePluginIds]);
  useEffect(() => { void Promise.all([loadInstalledPlugins(), loadActivePlugins()]).then(([installed, activeIds]) => { setPlugins(installed); setActive(new Set(activeIds)); }).catch(() => undefined); }, []);
  const refresh = async () => {
    const [installed, activeIds] = await Promise.all([loadInstalledPlugins(), loadActivePlugins()]);
    setPlugins(installed);
    setActive(new Set(activeIds));
    onChanged();
  };
  const toggle = async (plugin: PluginManifest) => {
    const wasActive = active.has(plugin.id);
    setUploadState(`${wasActive ? "Deactivating" : "Activating"} ${plugin.name}...`);
    try {
      if (wasActive) await deactivatePlugin(plugin.id);
      else {
        await activatePlugin(plugin.id);
        if (plugin.capabilities.length) await grantCapabilities(plugin.id, plugin.capabilities.map((capability) => capability.id));
      }
      await refresh();
      setUploadState(`${plugin.name} is ${wasActive ? "inactive" : "active"} in workspace/default`);
    } catch {
      setUploadState("Workspace plugin state could not be changed. Admin access may be required.");
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setUploadState(`Uploading ${file.name}…`);
    try {
      const result = await uploadPlugin(file);
      if (result.status === "approval-required" && result.bundle) { setPendingBundle(result.bundle); setUploadState(`Approval required for ${result.bundle.manifest.name}`); return; }
      setUploadState(`Installed ${result.manifest?.name ?? file.name}`); await refresh();
    } catch { setUploadState("Upload failed. Core worker unavailable or package invalid."); }
  };
  const approve = async () => {
    if (!pendingBundle) return;
    const manifest = await approveInstall(pendingBundle);
    if (manifest.capabilities.length) await grantCapabilities(manifest.id, manifest.capabilities.map((capability) => capability.id));
    setPendingBundle(null); setUploadState(`Installed and activated ${manifest.name}`); await refresh();
  };
  return <SurfaceCard className="manager-panel">
    <div className="surface-header"><div><small>core</small><h2>Plugin Manager</h2></div><Button onClick={() => inputRef.current?.click()}>Upload ZIP</Button></div>
    <p>{uploadState}</p><input ref={inputRef} className="hidden-file" type="file" accept=".zip,application/zip" onChange={(event) => void upload(event.target.files?.[0])} />
    {pendingBundle ? <div className="approval-inline"><p>{pendingBundle.manifest.capabilities.length} requested capabilities</p><Button onClick={() => void approve()}>Approve & Install</Button></div> : null}
    <div className="plugin-list">{plugins.length ? plugins.map((plugin) => <div className="plugin-row" key={plugin.id}>
      <div><strong>{plugin.name}</strong><small>{plugin.id} · {plugin.version}</small></div>
      <div className="plugin-actions"><Badge>{active.has(plugin.id) ? "active" : "inactive"}</Badge><Button onClick={() => void toggle(plugin)}>{active.has(plugin.id) ? "Deactivate" : "Activate"}</Button></div>
    </div>) : <p>No feature plugins installed.</p>}</div>
  </SurfaceCard>;
}
