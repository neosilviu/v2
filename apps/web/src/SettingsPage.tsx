import { useEffect, useMemo, useState } from "react";
import type { PluginManifest } from "@v2/plugin-contracts";
import type { Notification } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { loadActivePlugins, loadInstalledPlugins, loadSettingsTab, loadSettingsTabs, loadWorkspaceUiSurfaces, type RuntimeSettingsTab, type RuntimeSettingsTabResolution } from "./api";
import type { WorkspaceSummary } from "./platform-contracts";
import { SettingsRenderer } from "./platform/SettingsRenderer";
import { composeShellFromSurfaces } from "./shell";

type SettingsPageProps = {
  shell: ShellState;
  onShellChange: (state: ShellState) => void;
  emit: (item: Notification) => void;
  workspace: WorkspaceSummary | null;
  onRuntimeChanged: (plugins: PluginManifest[], activePluginIds: Set<string>, shell: ShellState) => void;
};

function selectedTabFromUrl(tabs: RuntimeSettingsTab[]) {
  const params = new URLSearchParams(window.location.search);
  const desired = params.get("tab") ?? "";
  return tabs.find((tab) => tab.id === desired)?.id ?? tabs[0]?.id ?? "";
}

export function SettingsPage({ shell, onShellChange, emit, workspace, onRuntimeChanged }: SettingsPageProps) {
  const [tabs, setTabs] = useState<RuntimeSettingsTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState("");
  const [resolution, setResolution] = useState<RuntimeSettingsTabResolution | null>(null);
  const [status, setStatus] = useState("Settings ready");

  const allTabs = useMemo(() => tabs, [tabs]);
  const selectedTab = useMemo(() => allTabs.find((tab) => tab.id === selectedTabId) ?? null, [selectedTabId, allTabs]);

  useEffect(() => {
    let alive = true;
    void loadSettingsTabs().then((loaded) => {
      if (!alive) return;
      setTabs(loaded);
      setSelectedTabId(selectedTabFromUrl(loaded));
      setStatus("Settings loaded");
    }).catch((error) => {
      if (!alive) return;
      setStatus(error instanceof Error ? error.message : "Settings registry unavailable");
      setSelectedTabId("");
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedTabId) return;
    const nextUrl = `/settings?tab=${encodeURIComponent(selectedTabId)}`;
    if (window.location.pathname !== "/settings" || window.location.search !== `?tab=${encodeURIComponent(selectedTabId)}`) window.history.replaceState(null, "", nextUrl);
    if (!selectedTabId.startsWith("platform.settings.")) {
      let alive = true;
      setResolution(null);
      void loadSettingsTab(selectedTabId).then((loaded) => {
        if (!alive) return;
        setResolution(loaded);
        setStatus(`${loaded.tab.label} loaded`);
      }).catch((error) => {
        if (!alive) return;
        setStatus(error instanceof Error ? error.message : "Settings tab unavailable");
      });
      return () => { alive = false; };
    }
    let alive = true;
    void loadSettingsTab(selectedTabId).then((loaded) => {
      if (!alive) return;
      setResolution(loaded);
      setStatus(`${loaded.tab.label} loaded`);
    }).catch((error) => {
      if (!alive) return;
      setStatus(error instanceof Error ? error.message : "Platform settings unavailable");
    });
    return () => { alive = false; };
  }, [selectedTabId]);

  const refreshRuntime = async () => {
    const [installed, activeIds, surfaces] = await Promise.all([loadInstalledPlugins(), loadActivePlugins(), loadWorkspaceUiSurfaces()]);
    onRuntimeChanged(installed as PluginManifest[], new Set(activeIds), composeShellFromSurfaces(surfaces));
    emit({ id: crypto.randomUUID(), level: "success", title: "Runtime refreshed", message: "Settings and plugin contributions were reloaded.", source: "platform", dismissible: true, createdAt: new Date().toISOString() });
  };

  return <div className="settings-hub">
    <header className="settings-header">
      <div className="settings-header-copy">
        <small>{workspace?.id ?? "no-workspace"}</small>
        <h2>Settings</h2>
        {selectedTabId === "platform.settings.security" ? <strong>Security administration</strong> : null}
        <p>{status}</p>
        <span className="settings-meta">{selectedTab ? selectedTab.label : "No tab selected"}</span>
      </div>
      <div className="settings-header-actions">
        <Badge>{allTabs.length} tabs</Badge>
        <Button onClick={() => void refreshRuntime()}>Refresh runtime</Button>
      </div>
    </header>
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Settings tabs">
        {allTabs.map((tab) => <button key={tab.id} className={tab.id === selectedTabId ? "settings-tab active" : "settings-tab"} type="button" onClick={() => setSelectedTabId(tab.id)}>
          <span>{tab.label}</span>
          <small>{"ownerName" in tab ? tab.ownerName : "Platform"}</small>
        </button>)}
      </nav>
      <section className="settings-panel">
        {!resolution ? <SurfaceCard><h2>No Settings tab</h2><p>No active Settings contribution is available for this workspace.</p></SurfaceCard> : <SettingsRenderer panel={resolution.panel} shell={shell} onShellChange={onShellChange} />}
      </section>
    </div>
  </div>;
}
