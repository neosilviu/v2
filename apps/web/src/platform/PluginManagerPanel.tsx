import { useEffect, useRef, useState } from "react";
import type { PluginManifest } from "@v2/plugin-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { activatePlugin, approveInstall, deactivatePlugin, installMarketplacePlugin, loadActivePlugins, loadInstalledPlugins, loadMarketplacePlugins, uploadPlugin, type MarketplacePlugin } from "../api";

export function PluginManagerPanel({ plugins: initialPlugins, activePluginIds, onChanged }: { plugins: PluginManifest[]; activePluginIds: Set<string>; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [active, setActive] = useState(activePluginIds);
  const [marketplace, setMarketplace] = useState<MarketplacePlugin[]>([]);
  const [pendingApproval, setPendingApproval] = useState<{ approvalId: string; pluginId: string; marketplace: boolean; title: string; sha256: string } | null>(null);
  const [pendingMarketplaceId, setPendingMarketplaceId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState("Official plugins start uninstalled. Install them from Marketplace when this workspace needs them.");
  const workspaceInstalled = [
    ...marketplace.filter((item) => item.installed).map((item) => item.manifest),
    ...plugins.filter((plugin) => !marketplace.some((item) => item.manifest.id === plugin.id)),
  ];
  useEffect(() => { setPlugins(initialPlugins); }, [initialPlugins]);
  useEffect(() => { setActive(activePluginIds); }, [activePluginIds]);
  useEffect(() => { void Promise.all([loadInstalledPlugins(), loadActivePlugins(), loadMarketplacePlugins()]).then(([installed, activeIds, available]) => { setPlugins(installed); setActive(new Set(activeIds)); setMarketplace(available); }).catch(() => undefined); }, []);
  const refresh = async () => {
    const [installed, activeIds, available] = await Promise.all([loadInstalledPlugins(), loadActivePlugins(), loadMarketplacePlugins()]);
    setPlugins(installed);
    setActive(new Set(activeIds));
    setMarketplace(available);
    onChanged();
  };
  const install = async (item: MarketplacePlugin) => {
    setUploadState(`Installing ${item.manifest.name} from Marketplace...`);
    try {
      const result = await installMarketplacePlugin(item.manifest.id);
      if (result.status === "approval-required") {
        setPendingApproval({ approvalId: result.approvalId, pluginId: result.pluginId, marketplace: true, title: item.manifest.name, sha256: result.sha256 });
        setPendingMarketplaceId(item.manifest.id);
        setUploadState(`Persistent approval required for ${item.manifest.name}. Use Approvals to approve it, then resume install.`);
        return;
      }
      await refresh();
      setUploadState(`${result.plugin.manifest.name} installed and active in workspace/default`);
    } catch {
      setUploadState("Marketplace install failed. Platform admin access may be required.");
    }
  };
  const toggle = async (plugin: PluginManifest) => {
    const wasActive = active.has(plugin.id);
    setUploadState(`${wasActive ? "Deactivating" : "Activating"} ${plugin.name}...`);
    try {
      if (wasActive) await deactivatePlugin(plugin.id);
      else await activatePlugin(plugin.id);
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
      if (result.status === "approval-required" && result.approvalId && result.pluginId) {
        setPendingApproval({ approvalId: result.approvalId, pluginId: result.pluginId, marketplace: false, title: result.pluginId, sha256: result.sha256 ?? "" });
        setPendingMarketplaceId(null);
        setUploadState(`Persistent approval required for ${result.pluginId}. Use Approvals to approve it, then resume install.`);
        return;
      }
      setUploadState(`Installed ${result.manifest?.name ?? file.name}`); await refresh();
    } catch { setUploadState("Upload failed. Core worker unavailable or package invalid."); }
  };
  const resumeInstall = async () => {
    if (!pendingApproval) return;
    if (pendingApproval.marketplace && pendingMarketplaceId) {
      const result = await installMarketplacePlugin(pendingMarketplaceId, pendingApproval.approvalId);
      if (result.status === "installed") setUploadState(`Installed and activated ${result.plugin.manifest.name}`);
    } else {
      const manifest = await approveInstall(pendingApproval.approvalId);
      setUploadState(`Installed and activated ${manifest.name}`);
    }
    setPendingApproval(null); setPendingMarketplaceId(null); await refresh();
  };
  return <SurfaceCard className="manager-panel">
    <div className="surface-header"><div><small>core</small><h2>Plugin Manager</h2></div><Button onClick={() => inputRef.current?.click()}>Upload ZIP</Button></div>
    <p>{uploadState}</p><input ref={inputRef} className="hidden-file" type="file" accept=".zip,application/zip" onChange={(event) => void upload(event.target.files?.[0])} />
    {pendingApproval ? <div className="approval-inline"><p>{pendingApproval.title} awaits approval {pendingApproval.approvalId.slice(0, 8)} · {pendingApproval.sha256.slice(0, 12)}</p><Button onClick={() => void resumeInstall()}>Resume approved install</Button></div> : null}
    <div className="section-title"><h2>Marketplace</h2><Badge>{marketplace.length}</Badge></div>
    <div className="plugin-list">{marketplace.length ? marketplace.map((item) => <div className="plugin-row" key={item.manifest.id}>
      <div><strong>{item.manifest.name}</strong><small>{item.category} · {item.manifest.data.mode} storage · {item.demoAvailable ? "demo pack available" : "no demo seed"}</small></div>
      <div className="plugin-actions"><Badge>{item.installed ? item.active ? "active" : "installed" : "available"}</Badge>{item.installed ? null : <Button onClick={() => void install(item)}>Install</Button>}</div>
    </div>) : <p>No Marketplace plugins are available.</p>}</div>
    <div className="section-title"><h2>Installed in workspace</h2><Badge>{workspaceInstalled.length}</Badge></div>
    <div className="plugin-list">{workspaceInstalled.length ? workspaceInstalled.map((plugin) => <div className="plugin-row" key={plugin.id}>
      <div><strong>{plugin.name}</strong><small>{plugin.id} · {plugin.version}</small></div>
      <div className="plugin-actions"><Badge>{active.has(plugin.id) ? "active" : "inactive"}</Badge><Button onClick={() => void toggle(plugin)}>{active.has(plugin.id) ? "Deactivate" : "Activate"}</Button></div>
    </div>) : <p>No feature plugins installed.</p>}</div>
  </SurfaceCard>;
}
