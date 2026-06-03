import { useEffect, useState } from "react";
import type { PluginManifest } from "@v2/plugin-contracts";
import type { Notification } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
import { Button, SurfaceCard } from "@v2/ui-kit";
import {
  loadActivePlugins,
  loadInstalledPlugins,
  loadSettingsTab,
  loadSettingsTabs,
  loadWorkspaceUiSurfaces,
  type RuntimeSettingsTab,
  type RuntimeSettingsTabResolution,
} from "./api";
import { SettingsRenderer } from "./platform/SettingsRenderer";
import { createSettingsNotification } from "./platform/settings-ui";
import { composeShellFromSurfaces } from "./shell";

type SettingsPageProps = {
  shell: ShellState;
  onShellChange: (state: ShellState) => void;
  emit: (item: Notification) => void;
  onRuntimeChanged: (
    plugins: PluginManifest[],
    activePluginIds: Set<string>,
    shell: ShellState,
  ) => void;
};

function selectedTabFromUrl(tabs: RuntimeSettingsTab[]) {
  const params = new URLSearchParams(window.location.search);
  const desired = params.get("tab") ?? "";
  return tabs.find((tab) => tab.id === desired)?.id ?? tabs[0]?.id ?? "";
}

export function SettingsPage({
  shell,
  onShellChange,
  emit,
  onRuntimeChanged,
}: SettingsPageProps) {
  const [tabs, setTabs] = useState<RuntimeSettingsTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState("");
  const [resolution, setResolution] =
    useState<RuntimeSettingsTabResolution | null>(null);
  const [status, setStatus] = useState("Loading settings...");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    void loadSettingsTabs()
      .then((loaded) => {
        if (!alive) return;
        setTabs(loaded);
        setSelectedTabId(selectedTabFromUrl(loaded));
        setStatus("Settings ready");
        setError(null);
      })
      .catch((requestError) => {
        if (!alive) return;
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Settings registry unavailable.";
        setError(message);
        setStatus("Settings unavailable");
        setSelectedTabId("");
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTabId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", selectedTabId);
    const nextSearch = `?${params.toString()}`;
    if (
      window.location.pathname !== "/settings" ||
      window.location.search !== nextSearch
    ) {
      window.history.replaceState(null, "", `/settings${nextSearch}`);
    }
    let alive = true;
    setBusy(true);
    setError(null);
    void loadSettingsTab(selectedTabId)
      .then((loaded) => {
        if (!alive) return;
        setResolution(loaded);
        setStatus(`${loaded.tab.label} loaded`);
      })
      .catch((requestError) => {
        if (!alive) return;
        const message =
          requestError instanceof Error
            ? requestError.message
            : "This settings section could not be loaded.";
        setError(message);
        setStatus("Section unavailable");
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
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
      onRuntimeChanged(
        installed,
        new Set(activeIds),
        composeShellFromSurfaces(surfaces),
      );
      setStatus("Saved values reloaded");
      setError(null);
      emit(
        createSettingsNotification(
          "success",
          "Settings refreshed",
          "Saved configuration and installed applications were reloaded.",
        ),
      );
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Settings could not be refreshed.";
      setError(message);
      emit(createSettingsNotification("error", "Refresh failed", message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-hub settings-shell stack">
      <div
        className="toolbar toolbar-tabs page-inline-tabs settings-tab-strip"
        aria-label="Settings sections"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={
              tab.id === selectedTabId
                ? "surface-tab surface-tab-active"
                : "surface-tab"
            }
            type="button"
            onClick={() => setSelectedTabId(tab.id)}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="settings-feedback error" role="alert">
          <strong>Something went wrong</strong>
          <span>{error}</span>
          <Button
            aria-label="Try again"
            className="settings-icon-button"
            onClick={() => void refreshRuntime()}
            disabled={busy}
            title="Try again"
          >
            ↻
          </Button>
        </div>
      ) : null}

      <section className="settings-panel" aria-busy={busy}>
        {!resolution ? (
          <SurfaceCard className="settings-empty">
            <h2>{busy ? "Loading settings..." : "No settings available"}</h2>
            <p>
              {busy
                ? "Loading saved configuration for this workspace."
                : status}
            </p>
          </SurfaceCard>
        ) : (
          <SettingsRenderer
            key={resolution.panel.id}
            panel={resolution.panel}
            shell={shell}
            onShellChange={onShellChange}
            emit={emit}
          />
        )}
      </section>
    </section>
  );
}
