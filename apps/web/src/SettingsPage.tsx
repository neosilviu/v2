import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AuthMethod, AuthPolicy } from "@v2/auth-contracts";
import { notification } from "@v2/feedback-runtime";
import type { PluginManifest } from "@v2/plugin-contracts";
import type { Notification } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { activateDomain, createDomain, disableDomain, isCoreAuthRequiredError, loadActivePlugins, loadCurrentRbac, loadDomains, loadInstalledPlugins, loadMarketplacePlugins, loadSettingsTab, loadSettingsTabs, loadWorkspaceUiSurfaces, verifyDomain, type MarketplacePlugin, type RbacMe, type RuntimeSettingsTab, type RuntimeSettingsTabResolution, type WorkspaceDomain } from "./api";
import { loadAuthSecuritySummary, loadAuthSessionsSummary, saveAuthMethod, saveAuthPolicy, type AuthSecuritySummary } from "./auth-api";
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

function SecurityPanel({ emit }: { emit: (item: Notification) => void }) {
  const [summary, setSummary] = useState<AuthSecuritySummary | null>(null);
  const [sessions, setSessions] = useState<{ sessions: number; passkeys: number } | null>(null);
  const [rbac, setRbac] = useState<RbacMe | null>(null);
  const [status, setStatus] = useState("Loading security controls...");

  const refresh = async () => {
    const [nextSummary, nextSessions, nextRbac] = await Promise.all([loadAuthSecuritySummary(), loadAuthSessionsSummary(), loadCurrentRbac()]);
    setSummary(nextSummary);
    setSessions(nextSessions);
    setRbac(nextRbac);
    setStatus("Security controls loaded");
  };

  useEffect(() => {
    void refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Security controls unavailable"));
  }, []);

  const updatePolicy = async (patch: Partial<AuthPolicy>) => {
    if (!summary) return;
    const policy = await saveAuthPolicy({ ...summary.policy, ...patch });
    setSummary({ ...summary, policy });
    emit(notification("success", "Auth policy saved", "Login runtime configuration will reflect the published policy."));
  };

  const updateMethod = async (method: AuthMethod, patch: Partial<AuthMethod>) => {
    if (!summary) return;
    const saved = await saveAuthMethod({ ...method, ...patch });
    setSummary({ ...summary, methods: summary.methods.map((item) => item.id === saved.id ? saved : item) });
    emit(notification("success", "Auth method saved", `${saved.title} is ${saved.publicVisible ? "public" : "private"}.`));
  };

  return <SurfaceCard>
    <div className="surface-header">
      <div><small>Auth Worker boundary</small><h2>Security administration</h2><p>{status}</p></div>
      <Button onClick={() => void refresh()}>Refresh</Button>
    </div>
    {summary ? <div className="settings-grid">
      <section className="settings-subpanel">
        <h3>Registration policy</h3>
        <label className="field">Registration
          <select value={summary.policy.registrationMode} onChange={(event) => void updatePolicy({ registrationMode: event.currentTarget.value as AuthPolicy["registrationMode"] })}>
            <option value="disabled">Disabled</option>
            <option value="open">Open</option>
            <option value="invitation-only">Invitation only</option>
            <option value="admin-created">Admin created</option>
          </select>
        </label>
        <label className="template-check"><input type="checkbox" checked={summary.policy.allowPasskeySignin} onChange={(event) => void updatePolicy({ allowPasskeySignin: event.currentTarget.checked })} />Allow passkey sign-in</label>
        <label className="template-check"><input type="checkbox" checked={summary.policy.allowPasskeyRegistration} onChange={(event) => void updatePolicy({ allowPasskeyRegistration: event.currentTarget.checked })} />Allow passkey registration</label>
        <label className="template-check"><input type="checkbox" checked={summary.policy.requireEmailVerification} onChange={(event) => void updatePolicy({ requireEmailVerification: event.currentTarget.checked })} />Require email verification</label>
        <p>Email delivery: {summary.emailDelivery.status}. Verification/reset stay unavailable until a server-side mail adapter is configured.</p>
      </section>
      <section className="settings-subpanel">
        <h3>Auth methods</h3>
        <div className="plugin-list">{summary.methods.map((method) => <div className="plugin-row" key={method.id}>
          <div><strong>{method.title}</strong><small>{method.type}{method.providerId ? `/${method.providerId}` : ""} · {method.status} · {method.publicVisible ? "public" : "private"}</small></div>
          <div className="plugin-actions">
            <Button onClick={() => void updateMethod(method, { status: method.status === "enabled" ? "disabled" : "enabled", publicVisible: method.status !== "enabled" })}>{method.status === "enabled" ? "Disable" : "Enable"}</Button>
            <Button onClick={() => void updateMethod(method, { publicVisible: !method.publicVisible })}>{method.publicVisible ? "Unpublish" : "Publish"}</Button>
          </div>
        </div>)}</div>
      </section>
      <section className="settings-subpanel">
        <h3>Overview</h3>
        <p>Available server-side: password {summary.serverSideAvailability.password ? "yes" : "no"}, passkey {summary.serverSideAvailability.passkey ? "yes" : "no"}, GitHub {summary.serverSideAvailability.github ? "configured" : "not configured"}.</p>
        <p>Sessions: {sessions?.sessions ?? 0}. Passkeys: {sessions?.passkeys ?? 0}. Published login slots: {summary.publishedLoginContributions}.</p>
        <p>Current user: {rbac?.user?.email ?? "unknown"}. Roles: {rbac?.roles.join(", ") || "none"}. Permissions: {rbac?.permissions.length ?? 0}.</p>
        {rbac?.recoveryAdmin ? <p className="message">Bootstrap/recovery admin is active for this user until RBAC ownership is fully assigned.</p> : null}
      </section>
    </div> : null}
  </SurfaceCard>;
}

function DomainsPanel({ emit }: { emit: (item: Notification) => void }) {
  const [domains, setDomains] = useState<WorkspaceDomain[]>([]);
  const [status, setStatus] = useState("Loading domains...");

  const refresh = async () => {
    const loaded = await loadDomains();
    setDomains(loaded);
    setStatus(`${loaded.length} domains loaded`);
  };

  useEffect(() => {
    void refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Domains unavailable"));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const hostname = String(form.get("hostname") ?? "");
    const kind = String(form.get("kind") ?? "website") as WorkspaceDomain["kind"];
    const verificationMethod = String(form.get("verificationMethod") ?? "manual") as WorkspaceDomain["verificationMethod"];
    setDomains(await createDomain({ hostname, kind, verificationMethod }));
    event.currentTarget.reset();
    emit(notification("success", "Domain created", "The domain is draft until verification and activation are completed."));
  };

  const apply = async (label: string, action: () => Promise<WorkspaceDomain[]>) => {
    setDomains(await action());
    emit(notification("success", label, "Domain trust metadata was updated in Core."));
  };

  return <SurfaceCard>
    <div className="surface-header">
      <div><small>Core domain trust</small><h2>Domains</h2><p>{status}</p></div>
      <Button onClick={() => void refresh()}>Refresh</Button>
    </div>
    <form className="domain-form" onSubmit={submit}>
      <input name="hostname" placeholder="app.example.com" required />
      <select name="kind" defaultValue="website">
        <option value="admin">Admin</option>
        <option value="auth">Auth</option>
        <option value="website">Website</option>
        <option value="storefront">Storefront</option>
        <option value="public-chat">Public chat</option>
      </select>
      <select name="verificationMethod" defaultValue="manual">
        <option value="manual">Manual</option>
        <option value="dns-txt">DNS TXT</option>
        <option value="dns-cname">DNS CNAME</option>
      </select>
      <Button className="primary" type="submit">Add</Button>
    </form>
    <div className="template-table-wrap"><table><thead><tr><th>Hostname</th><th>Kind</th><th>Status</th><th>Verification</th><th></th></tr></thead><tbody>{domains.map((domain) => <tr key={domain.id}>
      <td>{domain.hostname}</td><td>{domain.kind}</td><td>{domain.status}</td><td>{domain.verificationMethod}</td>
      <td><div className="plugin-actions"><Button onClick={() => void apply("Domain verified", () => verifyDomain(domain.id))}>Verify</Button><Button onClick={() => void apply("Domain activated", () => activateDomain(domain.id))}>Activate</Button><Button onClick={() => void apply("Domain disabled", () => disableDomain(domain.id))}>Disable</Button></div></td>
    </tr>)}</tbody></table></div>
    <p>Only verified active admin/auth domains can become trusted-origin candidates. Manual verification is an explicit admin action for local/testing use.</p>
  </SurfaceCard>;
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
        {selectedTabId === "platform.settings.security" ? <SecurityPanel emit={emit} /> : null}
        {selectedTabId === "platform.settings.domains" ? <DomainsPanel emit={emit} /> : null}
      </section>
    </div>
  </div>;
}
