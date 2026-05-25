import { useEffect, useRef, useState } from "react";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { approveInstall, grantCapabilities, loadInstalledPlugins, uploadPlugin } from "../api";
import type { PluginBundle, PluginManifest } from "../runtime-types";

export function PluginManagerPanel({ plugins: initialPlugins, onChanged }: { plugins: PluginManifest[]; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [pendingBundle, setPendingBundle] = useState<PluginBundle | null>(null);
  const [uploadState, setUploadState] = useState("Upload a ZIP containing plugin.json");
  useEffect(() => { setPlugins(initialPlugins); }, [initialPlugins]);
  useEffect(() => { void loadInstalledPlugins().then(setPlugins).catch(() => undefined); }, []);
  const refresh = async () => { setPlugins(await loadInstalledPlugins()); onChanged(); };
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
    <div className="plugin-list">{plugins.length ? plugins.map((plugin) => <div className="plugin-row" key={plugin.id}><div><strong>{plugin.name}</strong><small>{plugin.id} · {plugin.version}</small></div><Badge>{plugin.builtIn ? "built-in" : "installed"}</Badge></div>) : <p>No feature plugins installed.</p>}</div>
  </SurfaceCard>;
}
