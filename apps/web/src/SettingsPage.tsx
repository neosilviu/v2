import { useEffect, useState } from "react";
import type { PluginManifest } from "@v2/plugin-contracts";
import type { Notification } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { loadActivePlugins, loadInstalledPlugins, loadSettingsTab, loadSettingsTabs, loadWorkspaceUiSurfaces, type RuntimeSettingsTab, type RuntimeSettingsTabResolution } from "./api";
import { SettingsRenderer } from "./platform/SettingsRenderer";
import { createSettingsNotification } from "./platform/settings-ui";
import { composeShellFromSurfaces } from "./shell";

type SettingsPageProps = {
  shell: ShellState;
  onShellChange: (state: ShellState) => void;
  emit: (item: Notification) => void;
  onRuntimeChanged: (plugins: PluginManifest[], activePluginIds: Set<string>, shell: ShellState) => void;
};

const tabDescriptions: Record<string, string> = {
  "platform.settings.general": "Workspace name, branding, locale, public contact details and mail delivery.",
  "platform.settings.security": "Users, roles, authentication, sessions and access control.",
  "platform.settings.plans": "Workspace plan definitions and plan assignments.",
  "platform.settings.interface": "Navigation, layout and interface customization.",
  "platform.settings.marketplace": "Installed runtimes, marketplace catalog and activation controls.",
  "platform.settings.workspaces": "Tenant workspaces, status and lifecycle controls.",
};

function selectedTabFromUrl(tabs: RuntimeSettingsTab[]) {
  const params = new URLSearchParams(window.location.search);
  const desired = params.get("tab") ?? "";
  return tabs.find((tab) => tab.id === desired)?.id ?? tabs[0]?.id ?? "";
}

export function SettingsPage({ shell, onShellChange, emit, onRuntimeChanged }: SettingsPageProps) {
  const [tabs, setTabs] = useState<RuntimeSettingsTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState("");
  const [resolution, setResolution] = useState<RuntimeSettingsTabResolution | null>(null);
  const [status, setStatus] = useState("Loading settings...");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTab = tabs.find((tab) => tab.id === selectedTabId) ?? null;
  const title = selectedTab?.label ?? "Settings";
  const description = selectedTab ? tabDescriptions[selectedTab.id] ?? "Manage workspace configuration." : "Select a settings section.";
  const shellSurfacesCount = shell.surfaces.length;

  useEffect(() => {
    let alive = true;
    setBusy(true);
    void loadSettingsTabs().then((loaded) => {
      if (!alive) return;
      setTabs(loaded);
      setSelectedTabId(selectedTabFromUrl(loaded));
      setStatus("Settings ready");
      setError(null);
    }).catch((requestError) => {
      if (!alive) return;
      const message = requestError instanceof Error ? requestError.message : "Settings registry unavailable.";
      setError(message);
      setStatus("Settings unavailable");
      setSelectedTabId("");
    }).finally(() => {
      if (alive) setBusy(false);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!selectedTabId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", selectedTabId);
    const nextSearch = `?${params.toString()}`;
    if (window.location.pathname !== "/settings" || window.location.search !== nextSearch) {
      window.history.replaceState(null, "", `/settings${nextSearch}`);
    }
    let alive = true;
    setBusy(true);
    setError(null);
    void loadSettingsTab(selectedTabId).then((loaded) => {
      if (!alive) return;
      setResolution(loaded);
      setStatus(`${loaded.tab.label} loaded`);
    }).catch((requestError) => {
      if (!alive) return;
      const message = requestError instanceof Error ? requestError.message : "This settings section could not be loaded.";
      setError(message);
      setStatus("Section unavailable");
    }).finally(() => {
      if (alive) setBusy(false);
    });
    return () => { alive = false; };
  }, [selectedTabId]);

  const refreshRuntime = async () => {
    setBusy(true);
    try {
      const [installed, activeIds, surfaces, loadedTabs] = await Promise.all([
        loadInstalledPlugins(),
        loadActivePlugins(),
        loadWorkspaceUiSurfaces(),
        loadSettingsTabs(),
      ]);
      setTabs(loadedTabs);
      if (selectedTabId) {
        const loadedResolution = await loadSettingsTab(selectedTabId);
        setResolution(loadedResolution);
      }
      onRuntimeChanged(installed, new Set(activeIds), composeShellFromSurfaces(surfaces));
      setStatus("Saved values reloaded");
      setError(null);
      emit(createSettingsNotification("success", "Settings refreshed", "Saved configuration and installed applications were reloaded."));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Settings could not be refreshed.";
      setError(message);
      emit(createSettingsNotification("error", "Refresh failed", message));
    } finally {
      setBusy(false);
    }
  };

  return <div className="settings-hub">
    <header className="settings-header settings-product-header">
      <div className="settings-header-copy">
        <small>Workspace administration</small>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-header-actions">
        <Badge>{busy ? "Loading" : error ? "Attention required" : "Ready"}</Badge>
        <Button onClick={() => void refreshRuntime()} disabled={busy}>Reload saved values</Button>
      </div>
    </header>

    <div className="settings-metrics">
      <SurfaceCard className="settings-metric">
        <small>Sections</small>
        <strong>{tabs.length}</strong>
        <p>Available settings areas for this workspace.</p>
      </SurfaceCard>
      <SurfaceCard className="settings-metric">
        <small>Current section</small>
        <strong>{selectedTab?.label ?? "None"}</strong>
        <p>{selectedTab ? selectedTab.id : "Pick a section from the list."}</p>
      </SurfaceCard>
      <SurfaceCard className="settings-metric">
        <small>Runtime surfaces</small>
        <strong>{shellSurfacesCount}</strong>
        <p>Mounted workspace surfaces contributing to this shell.</p>
      </SurfaceCard>
    </div>

    {error ? <div className="settings-feedback error" role="alert">
      <strong>Something went wrong</strong>
      <span>{error}</span>
      <Button onClick={() => void refreshRuntime()} disabled={busy}>Try again</Button>
    </div> : null}

    <div className="settings-layout settings-product-layout">
      <nav className="settings-tabs settings-navigation" aria-label="Settings sections">
        {tabs.map((tab) => <button key={tab.id} className={tab.id === selectedTabId ? "settings-tab active" : "settings-tab"} type="button" onClick={() => setSelectedTabId(tab.id)}>
          <span>{tab.label}</span>
          <small>{tabDescriptions[tab.id] ?? ("ownerName" in tab ? tab.ownerName : "Workspace")}</small>
        </button>)}
      </nav>

      <section className="settings-panel" aria-busy={busy}>
        {!resolution
          ? <SurfaceCard className="settings-empty"><h2>{busy ? "Loading settings..." : "No settings available"}</h2><p>{busy ? "Loading saved configuration for this workspace." : status}</p></SurfaceCard>
          : <SettingsRenderer key={resolution.panel.id} panel={resolution.panel} shell={shell} onShellChange={onShellChange} emit={emit} />}
      </section>
    </div>
  </div>;
}
