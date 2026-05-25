import { useRef, useState } from "react";
import type { PluginManifest } from "@v2/plugin-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { uploadPlugin } from "../api";

export function PluginManagerPanel({ plugins }: { plugins: PluginManifest[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState("Upload a ZIP containing plugin.json");
  const selectZip = () => inputRef.current?.click();
  const upload = async (file?: File) => {
    if (!file) return;
    setUploadState(`Uploading ${file.name}…`);
    try {
      const result = await uploadPlugin(file);
      setUploadState(result.status === "approval-required" ? `Approval required for ${result.bundle?.manifest.name ?? file.name}` : `Installed ${result.manifest?.name ?? file.name}`);
    } catch { setUploadState("Upload failed. Core worker unavailable or package invalid."); }
  };
  return <SurfaceCard className="manager-panel">
    <div className="surface-header"><div><small>core</small><h2>Plugin Manager</h2></div><Button onClick={selectZip}>Upload ZIP</Button></div>
    <p>{uploadState}</p><input ref={inputRef} className="hidden-file" type="file" accept=".zip,application/zip" onChange={(event) => void upload(event.target.files?.[0])} />
    <div className="plugin-list">{plugins.map((plugin) => <div className="plugin-row" key={plugin.id}><div><strong>{plugin.name}</strong><small>{plugin.id} · {plugin.version}</small></div><Badge>{plugin.builtIn ? "built-in" : "installed"}</Badge></div>)}</div>
  </SurfaceCard>;
}
