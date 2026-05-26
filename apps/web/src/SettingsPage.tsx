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
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const [nextSummary, nextSessions, nextRbac] = await Promise.all([loadAuthSecuritySummary(), loadAuthSessionsSummary(), loadCurrentRbac()]);
      setSummary(nextSummary);
      setSessions(nextSessions);
      setRbac(nextRbac);
      setStatus("Security controls loaded");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Security controls unavailable"));
  }, []);

  const updatePolicy = async (patch: Partial<AuthPolicy>) => {
    if (!summary) return;
    setBusy(true);
    try {
      const policy = await saveAuthPolicy({ ...summary.policy, ...patch });
      setSummary({ ...summary, policy });
      setStatus("Security policy saved");
      emit(notification("success", "Auth policy saved", "Login runtime configuration will reflect the published policy."));
    } catch {
      setStatus("Security policy could not be saved");
      emit(notification("error", "Auth policy failed", "The Auth Worker rejected the policy update."));
    } finally {
      setBusy(false);
    }
  };

  const updateMethod = async (method: AuthMethod, patch: Partial<AuthMethod>) => {
    if (!summary) return;
    setBusy(true);
    try {
      const saved = await saveAuthMethod({ ...method, ...patch });
      setSummary({ ...summary, methods: summary.methods.map((item) => item.id === saved.id ? saved : item) });
      setStatus(`${saved.title} saved`);
      emit(notification("success", "Auth method saved", `${saved.title} is ${saved.publicVisible ? "public" : "private"}.`));
    } catch {
      setStatus("Auth method could not be saved");
      emit(notification("error", "Auth method failed", "The Auth Worker rejected the method update."));
    } finally {
      setBusy(false);
    }
  };

  return <SurfaceCard>
    <div className="surface-header">
      <div><small>Auth Worker boundary</small><h2>Security administration</h2><p>{status}</p></div>
      <Button onClick={() => void refresh()} disabled={busy}>Refresh</Button>
    </div>
    {summary ? <div className="settings-grid">
      <section className="settings-subpanel">
        <h3>Registration policy</h3>
        <label className="field">Registration mode
          <select value={summary.policy.registrationMode} disabled={busy} onChange={(event) => void updatePolicy({ registrationMode: event.currentTarget.value as AuthPolicy["registrationMode"] })}>
            <option value="disabled">Disabled</option>
            <option value="open">Open</option>
            <option value="invitation-only">Invitation only</option>
            <option value="admin-created">Admin created</option>
          </select>
        </label>
        <label className="template-check"><input type="checkbox" disabled={busy} checked={summary.policy.allowPasskeySignin} onChange={(event) => void updatePolicy({ allowPasskeySignin: event.currentTarget.checked })} />Allow passkey sign-in</label>
        <label className="template-check"><input type="checkbox" disabled={busy} checked={summary.policy.allowPasskeyRegistration} onChange={(event) => void updatePolicy({ allowPasskeyRegistration: event.currentTarget.checked })} />Allow passkey registration</label>
        <label className="template-check"><input type="checkbox" disabled={busy} checked={summary.policy.requireEmailVerification} onChange={(event) => void updatePolicy({ requireEmailVerification: event.currentTarget.checked })} />Require email verification</label>
        <p>Email delivery: {summary.emailDelivery.status}. Verification/reset stay unavailable until a server-side mail adapter is configured.</p>
        {summary.bootstrapAdmin ? <p className="message">Bootstrap admin is enabled. Keep this temporary and close it after permanent RBAC ownership is assigned.</p> : null}
      </section>
      <section className="settings-subpanel">
        <h3>Auth methods</h3>
        <div className="plugin-list">{summary.methods.map((method) => <div className="plugin-row" key={method.id}>
          <div><strong>{method.title}</strong><small>{method.type}{method.providerId ? `/${method.providerId}` : ""} · {method.status} · {method.publicVisible ? "public login" : "private"}</small></div>
          <div className="plugin-actions">
            <Button disabled={busy} onClick={() => void updateMethod(method, { status: method.status === "enabled" ? "disabled" : "enabled", publicVisible: method.status !== "enabled" })}>{method.status === "enabled" ? "Disable" : "Enable"}</Button>
            <Button disabled={busy || method.status !== "enabled"} onClick={() => void updateMethod(method, { publicVisible: !method.publicVisible })}>{method.publicVisible ? "Unpublish" : "Publish"}</Button>
          </div>
        </div>)}</div>
      </section>
      <section className="settings-subpanel">
        <h3>Runtime support</h3>
        <p>Available server-side: password {summary.serverSideAvailability.password ? "yes" : "no"}, passkey {summary.serverSideAvailability.passkey ? "yes" : "no"}, GitHub {summary.serverSideAvailability.github ? "configured" : "not configured"}.</p>
        <p>Sessions: {sessions?.sessions ?? 0}. Passkeys: {sessions?.passkeys ?? 0}. Published login slots: {summary.publishedLoginContributions}.</p>
      </section>
      <section className="settings-subpanel">
        <h3>Current admin</h3>
        <p>Current user: {rbac?.user?.email ?? "unknown"}. Roles: {rbac?.roles.join(", ") || "none"}. Permissions: {rbac?.permissions.length ?? 0}.</p>
        {rbac?.recoveryAdmin ? <p className="message">Bootstrap/recovery admin is active for this user until RBAC ownership is fully assigned.</p> : null}
      </section>
    </div> : null}
  </SurfaceCard>;
}

function DomainsPanel({ emit }: { emit: (item: Notification) => void }) {
  const [domains, setDomains] = useState<WorkspaceDomain[]>([]);
  const [status, setStatus] = useState("Loading domains...");
  const [busyDomainId, setBusyDomainId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setSaving(true);
    try {
    const loaded = await loadDomains();
    setDomains(loaded);
    setStatus(`${loaded.length} domains loaded`);
    } finally {
      setSaving(false);
    }
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
    const isPrimary = form.get("isPrimary") === "on";
    setSaving(true);
    try {
      setDomains(await createDomain({ hostname, kind, verificationMethod, isPrimary }));
      setStatus(`${hostname} created`);
      event.currentTarget.reset();
      emit(notification("success", "Domain created", "The domain is draft until verification and activation are completed."));
    } catch {
      setStatus("Domain could not be created");
      emit(notification("error", "Domain failed", "Core rejected the domain request."));
    } finally {
      setSaving(false);
    }
  };

  const apply = async (domain: WorkspaceDomain, label: string, action: () => Promise<WorkspaceDomain[]>) => {
    setBusyDomainId(domain.id);
    try {
      setDomains(await action());
      setStatus(`${domain.hostname}: ${label.toLowerCase()}`);
      emit(notification("success", label, "Domain trust metadata was updated in Core."));
    } catch {
      setStatus(`${domain.hostname}: action failed`);
      emit(notification("error", label, "Core rejected the domain action."));
    } finally {
      setBusyDomainId(null);
    }
  };

  return <SurfaceCard>
    <div className="surface-header">
      <div><small>Core domain trust</small><h2>Domains</h2><p>{status}</p></div>
      <Button onClick={() => void refresh()} disabled={saving}>Refresh</Button>
    </div>
    <form className="domain-form" onSubmit={submit}>
      <input name="hostname" placeholder="app.example.com" required disabled={saving} />
      <select name="kind" defaultValue="website" disabled={saving}>
        <option value="admin">Admin</option>
        <option value="auth">Auth</option>
        <option value="website">Website</option>
        <option value="storefront">Storefront</option>
        <option value="public-chat">Public chat</option>
      </select>
      <select name="verificationMethod" defaultValue="manual" disabled={saving}>
        <option value="manual">Manual</option>
        <option value="dns-txt">DNS TXT</option>
        <option value="dns-cname">DNS CNAME</option>
      </select>
      <label className="template-check"><input name="isPrimary" type="checkbox" disabled={saving} />Primary</label>
      <Button className="primary" type="submit" disabled={saving}>Add</Button>
    </form>
    <div className="template-table-wrap domain-table"><table><thead><tr><th>Hostname</th><th>Kind</th><th>Status</th><th>Verification</th><th>Publication</th><th></th></tr></thead><tbody>{domains.map((domain) => {
      const busy = busyDomainId === domain.id;
      const canVerify = domain.status === "draft" || domain.status === "verifying";
      const canActivate = domain.status === "verified";
      const canDisable = domain.status !== "disabled";
      return <tr key={domain.id}>
        <td><strong>{domain.hostname}</strong>{domain.isPrimary ? <small>Primary</small> : null}</td>
        <td>{domain.kind}</td>
        <td><span className={`status-pill ${domain.status}`}>{domain.status}</span></td>
        <td><span>{domain.verificationMethod}</span>{domain.verificationInstructions ? <pre className="domain-instructions">{JSON.stringify(domain.verificationInstructions, null, 2)}</pre> : null}</td>
        <td>{domain.publicationId ?? "none"}<small>{domain.verifiedAt ? `verified ${new Date(domain.verifiedAt).toLocaleString()}` : `updated ${new Date(domain.updatedAt).toLocaleString()}`}</small></td>
        <td><div className="plugin-actions"><Button disabled={busy || !canVerify} onClick={() => void apply(domain, "Domain verified", () => verifyDomain(domain.id))}>Verify</Button><Button disabled={busy || !canActivate} onClick={() => void apply(domain, "Domain activated", () => activateDomain(domain.id))}>Activate</Button><Button disabled={busy || !canDisable} onClick={() => void apply(domain, "Domain disabled", () => disableDomain(domain.id))}>Disable</Button></div></td>
      </tr>;
    })}</tbody></table></div>
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
