import { useEffect, useMemo, useState } from "react";
import { notification } from "@v2/feedback-runtime";
import type { PluginManifest } from "@v2/plugin-contracts";
import type { Notification } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { isCoreAuthRequiredError, loadActivePlugins, loadInstalledPlugins, loadMarketplacePlugins, loadSettingsTab, loadSettingsTabs, loadWorkspaceUiSurfaces, type MarketplacePlugin, type RuntimeSettingsTab, type RuntimeSettingsTabResolution } from "./api";
import { PluginManagerPanel } from "./platform/PluginManagerPanel";
import { RuntimeShellEditor } from "./platform/RuntimeShellEditor";
import { TemplateRenderer } from "./platform/TemplateRenderer";
import { composeShellFromSurfaces } from "./shell";

type SettingsPageProps = {
  shell: ShellState;
  onShellChange: (state: ShellState) => void;
  emit: (item: Notification) => void;
  onRuntimeChanged: (plugins: PluginManifest[], activePluginIds: Set<string>, shell: ShellState) => void;
};

function selectedTabFromUrl(tabs: RuntimeSettingsTab[]) {
  const params = new URLSearchParams(window.location.search);
  const desired = params.get("tab") ?? (window.location.pathname === "/marketplace" ? "platform.settings.marketplace" : "");
  return tabs.find((tab) => tab.id === desired)?.id ?? tabs[0]?.id ?? "";
}

export function SettingsPage({ shell, onShellChange, emit, onRuntimeChanged }: SettingsPageProps) {
  const [tabs, setTabs] = useState<RuntimeSettingsTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState("");
  const [resolution, setResolution] = useState<RuntimeSettingsTabResolution | null>(null);
  const [marketplacePlugins, setMarketplacePlugins] = useState<MarketplacePlugin[]>([]);
  const [status, setStatus] = useState("Loading runtime Settings...");

  const selectedTab = useMemo(() => tabs.find((tab) => tab.id === selectedTabId) ?? null, [selectedTabId, tabs]);

  useEffect(() => {
    let alive = true;
    void loadSettingsTabs().then((loaded) => {
      if (!alive) return;
      setTabs(loaded);
      setSelectedTabId(selectedTabFromUrl(loaded));
      setStatus(loaded.length ? "Runtime Settings ready" : "No Settings tabs are active");
    }).catch((error) => {
      if (!alive) return;
      setStatus(isCoreAuthRequiredError(error) ? "Authentication required" : "Settings registry unavailable");
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedTabId) return;
    const nextUrl = `/settings?tab=${encodeURIComponent(selectedTabId)}`;
    if (window.location.pathname !== "/settings" || window.location.search !== `?tab=${encodeURIComponent(selectedTabId)}`) window.history.replaceState(null, "", nextUrl);
    let alive = true;
    setResolution(null);
    void loadSettingsTab(selectedTabId).then((loaded) => {
      if (!alive) return;
      setResolution(loaded);
      setStatus(`${loaded.tab.label} loaded from runtime`);
    }).catch(() => {
      if (alive) setStatus("Settings tab unavailable");
    });
    return () => { alive = false; };
  }, [selectedTabId]);

  useEffect(() => {
    if (selectedTabId !== "platform.settings.marketplace") return;
    void loadMarketplacePlugins().then(setMarketplacePlugins).catch(() => setStatus("Marketplace unavailable"));
  }, [selectedTabId]);

  const refreshRuntime = async () => {
    const [installed, activeIds, surfaces] = await Promise.all([loadInstalledPlugins(), loadActivePlugins(), loadWorkspaceUiSurfaces()]);
    onRuntimeChanged(installed, new Set(activeIds), composeShellFromSurfaces(surfaces));
    emit(notification("success", "Runtime refreshed", "Settings and plugin contributions were reloaded."));
  };

  return <div className="settings-hub">
    <SurfaceCard className="settings-header-card">
      <div className="surface-header">
        <div><small>workspace/default</small><h2>Settings</h2><p>{status}</p></div>
        <Badge>{tabs.length} tabs</Badge>
      </div>
    </SurfaceCard>
    <div className="settings-layout">
      <nav className="settings-tabs" aria-label="Settings tabs">
        {tabs.map((tab) => <button key={tab.id} className={tab.id === selectedTabId ? "settings-tab active" : "settings-tab"} type="button" onClick={() => setSelectedTabId(tab.id)}>
          <span>{tab.label}</span>
          <small>{tab.category === "platform" ? "Platform" : tab.ownerName}</small>
        </button>)}
      </nav>
      <section className="settings-panel">
        {!selectedTab ? <SurfaceCard><h2>No Settings tab</h2><p>No active Settings contribution is available for this workspace.</p></SurfaceCard> : null}
        {selectedTab && !resolution ? <SurfaceCard><h2>{selectedTab.label}</h2><p>Loading panel contribution...</p></SurfaceCard> : null}
        {resolution ? <TemplateRenderer page={resolution.panel.schema} runtime={{ contributionId: resolution.panel.id }} /> : null}
        {selectedTabId === "platform.settings.marketplace" ? <PluginManagerPanel plugins={marketplacePlugins.map((item) => item.manifest)} activePluginIds={new Set(marketplacePlugins.filter((item) => item.active).map((item) => item.manifest.id))} onChanged={() => void refreshRuntime()} /> : null}
        {selectedTabId === "platform.settings.interface" ? <RuntimeShellEditor state={shell} onChange={onShellChange} /> : null}
        {selectedTabId === "platform.settings.security" ? <SurfaceCard><small>Auth Worker boundary</small><h2>Security administration</h2><p>Auth method publication, registration policy, passkeys and sessions are loaded from protected Auth admin APIs in the next closure step.</p></SurfaceCard> : null}
        {selectedTabId === "platform.settings.domains" ? <SurfaceCard><small>Domain trust boundary</small><h2>Domains</h2><p>Verified active Core domains are the only candidates for Auth trusted origins and public delivery mapping.</p></SurfaceCard> : null}
      </section>
    </div>
  </div>;
}
