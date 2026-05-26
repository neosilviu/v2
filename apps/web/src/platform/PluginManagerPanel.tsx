import { useEffect, useRef, useState } from "react";
import type { PluginManifest } from "@v2/plugin-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { approveInstall, deactivatePlugin, installMarketplacePlugin, loadActivePlugins, loadInstalledPlugins, loadMarketplacePlugins, uploadPlugin, type MarketplacePlugin } from "../api";

export function PluginManagerPanel({ plugins: initialPlugins, activePluginIds, onChanged }: { plugins: PluginManifest[]; activePluginIds: Set<string>; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [active, setActive] = useState(activePluginIds);
  const [marketplace, setMarketplace] = useState<MarketplacePlugin[]>([]);
  const [pendingApproval, setPendingApproval] = useState<{ approvalId: string; pluginId: string; marketplace: boolean; title: string; sha256: string } | null>(null);
  const [pendingMarketplaceId, setPendingMarketplaceId] = useState<string | null>(null);
  const [busyPluginId, setBusyPluginId] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState("Install a plugin only when its runtime is needed in this workspace.");
  const workspaceInstalled = [
    ...marketplace.filter((item) => item.installed).map((item) => item.manifest),
    ...plugins.filter((plugin) => !marketplace.some((item) => item.manifest.id === plugin.id)),
  ];
  useEffect(() => { setPlugins(initialPlugins); }, [initialPlugins]);
  useEffect(() => { setActive(activePluginIds); }, [activePluginIds]);
  useEffect(() => { void Promise.all([loadInstalledPlugins(), loadActivePlugins(), loadMarketplacePlugins()]).then(([installed, activeIds, available]) => { setPlugins(installed); setActive(new Set(activeIds)); setMarketplace(available); }).catch(() => setUploadState("Plugin catalog is unavailable.")); }, []);
  const refresh = async () => {
    const [installed, activeIds, available] = await Promise.all([loadInstalledPlugins(), loadActivePlugins(), loadMarketplacePlugins()]);
    setPlugins(installed);
    setActive(new Set(activeIds));
    setMarketplace(available);
    onChanged();
  };
  const installOrRepair = async (item: MarketplacePlugin) => {
    setBusyPluginId(item.manifest.id);
    setUploadState(`${item.installed ? "Provisioning runtime for" : "Installing"} ${item.manifest.name}...`);
    try {
      const result = await installMarketplacePlugin(item.manifest.id);
      if (result.status === "approval-required") {
        setPendingApproval({ approvalId: result.approvalId, pluginId: result.pluginId, marketplace: true, title: item.manifest.name, sha256: result.sha256 });
        setPendingMarketplaceId(item.manifest.id);
        setUploadState(`${item.manifest.name} requires approval before its runtime can be provisioned.`);
        return;
      }
      await refresh();
      setUploadState(`${result.plugin.manifest.name} is installed with an active runtime.`);
    } catch {
      setUploadState(`${item.manifest.name} could not be provisioned. It remains unavailable until a runtime deployment succeeds.`);
    } finally {
      setBusyPluginId(null);
    }
  };
  const deactivate = async (plugin: PluginManifest) => {
    setBusyPluginId(plugin.id);
    setUploadState(`Deactivating ${plugin.name}...`);
    try {
      await deactivatePlugin(plugin.id);
      await refresh();
      setUploadState(`${plugin.name} is inactive. Its UI and tools are no longer mounted.`);
    } catch {
      setUploadState(`${plugin.name} could not be deactivated.`);
    } finally {
      setBusyPluginId(null);
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
        setUploadState(`${result.pluginId} requires approval before installation and runtime provisioning.`);
        return;
      }
      setUploadState(`Installed ${result.manifest?.name ?? file.name} with its runtime.`);
      await refresh();
    } catch {
      setUploadState("Upload or runtime provisioning failed. No inactive feature is exposed as usable.");
    }
  };
  const resumeInstall = async () => {
    if (!pendingApproval) return;
    setBusyPluginId(pendingApproval.pluginId);
    try {
      if (pendingApproval.marketplace && pendingMarketplaceId) {
        const result = await installMarketplacePlugin(pendingMarketplaceId, pendingApproval.approvalId);
        if (result.status === "installed") setUploadState(`Installed and provisioned ${result.plugin.manifest.name}.`);
      } else {
        const manifest = await approveInstall(pendingApproval.approvalId);
        setUploadState(`Installed and provisioned ${manifest.name}.`);
      }
      setPendingApproval(null);
      setPendingMarketplaceId(null);
      await refresh();
    } catch {
      setUploadState("Approved installation could not produce an active runtime.");
    } finally {
      setBusyPluginId(null);
    }
  };
  return <SurfaceCard className="manager-panel">
    <div className="surface-header"><div><small>extensions</small><h2>Plugin Manager</h2><p>Only deployed runtimes become usable features.</p></div><Button onClick={() => inputRef.current?.click()}>Upload ZIP</Button></div>
    <p>{uploadState}</p><input ref={inputRef} className="hidden-file" type="file" accept=".zip,application/zip" onChange={(event) => void upload(event.target.files?.[0])} />
    {pendingApproval ? <div className="approval-inline"><p>{pendingApproval.title} awaits approval {pendingApproval.approvalId.slice(0, 8)} · {pendingApproval.sha256.slice(0, 12)}</p><Button disabled={busyPluginId === pendingApproval.pluginId} onClick={() => void resumeInstall()}>Resume provisioning</Button></div> : null}
    <div className="section-title"><h2>Marketplace</h2><Badge>{marketplace.length}</Badge></div>
    <div className="plugin-list">{marketplace.length ? marketplace.map((item) => {
      const isActive = active.has(item.manifest.id);
      const busy = busyPluginId === item.manifest.id;
      return <div className="plugin-row" key={item.manifest.id}>
        <div><strong>{item.manifest.name}</strong><small>{item.category} · {item.manifest.data.mode} storage · {isActive ? "runtime active" : item.installed ? "runtime not active" : "not installed"}</small></div>
        <div className="plugin-actions"><Badge>{isActive ? "active" : item.installed ? "unavailable" : "available"}</Badge>{!isActive ? <Button disabled={busy} onClick={() => void installOrRepair(item)}>{item.installed ? "Provision runtime" : "Install"}</Button> : null}</div>
      </div>;
    }) : <p>No Marketplace plugins are available.</p>}</div>
    <div className="section-title"><h2>Active features</h2><Badge>{workspaceInstalled.filter((plugin) => active.has(plugin.id)).length}</Badge></div>
    <div className="plugin-list">{workspaceInstalled.filter((plugin) => active.has(plugin.id)).length ? workspaceInstalled.filter((plugin) => active.has(plugin.id)).map((plugin) => <div className="plugin-row" key={plugin.id}>
      <div><strong>{plugin.name}</strong><small>{plugin.id} · {plugin.version} · mounted runtime</small></div>
      <div className="plugin-actions"><Badge>active</Badge><Button disabled={busyPluginId === plugin.id} onClick={() => void deactivate(plugin)}>Deactivate</Button></div>
    </div>) : <p>No deployed feature plugins are active in this workspace.</p>}</div>
  </SurfaceCard>;
}
