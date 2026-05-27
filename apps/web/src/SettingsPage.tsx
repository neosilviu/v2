import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import type { AuthMethod, AuthPolicy } from "@v2/auth-contracts";
import { notification } from "@v2/feedback-runtime";
import type { PluginManifest } from "@v2/plugin-contracts";
import type { ApprovalRequest, Notification, WorkspaceMember } from "@v2/rpc-contracts";
import type { ShellState } from "@v2/ui-runtime";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { activateDomain, activateMailProvider, configureMailProvider, createDomain, createWorkspacePublication, deleteWorkspacePublication, decideApprovalRequest, disableDomain, disableMailProvider, loadActivePlugins, loadAuditEvents, loadDomains, loadGeneralSettings, loadInstalledPlugins, loadMailSummary, loadMarketplacePlugins, loadPendingApprovalRequests, loadSecurityBootstrap, loadSettingsTab, loadSettingsTabs, loadWorkspaceMembers, loadWorkspacePublications, loadWorkspaceUiSurfaces, saveGeneralSettings, testMailProvider, updateWorkspacePublication, verifyDomain, type MailSummary, type MarketplacePlugin, type RbacMe, type RuntimeSettingsTab, type RuntimeSettingsTabResolution, type WorkspaceDomain, type WorkspaceSummary, CoreRequestError } from "./api";
import { saveAuthMethod, saveAuthPolicy, type AuthSecuritySummary } from "./api";
import { CrudRenderer } from "./platform/CrudRenderer";
import { PluginManagerPanel } from "./platform/PluginManagerPanel";
import { RuntimeShellEditor } from "./platform/RuntimeShellEditor";
import { TemplateRenderer } from "./platform/TemplateRenderer";
import { composeShellFromSurfaces } from "./shell";
import type { AuditEvent, WorkspacePublication } from "./platform-contracts";

type SettingsPageProps = {
  shell: ShellState;
  onShellChange: (state: ShellState) => void;
  emit: (item: Notification) => void;
  workspace: WorkspaceSummary | null;
  permissions: string[];
  onRuntimeChanged: (plugins: PluginManifest[], activePluginIds: Set<string>, shell: ShellState) => void;
};

type NativeTab = { id: string; label: string; permission: string };
const nativeTabs: NativeTab[] = [
  { id: "platform.settings.general", label: "General", permission: "workspace.settings.read" },
  { id: "platform.settings.security", label: "Security", permission: "auth.read" },
  { id: "platform.settings.domains", label: "Domains", permission: "domains.read" },
  { id: "platform.settings.mail", label: "Mail Delivery", permission: "mail.read" },
  { id: "platform.settings.marketplace", label: "Marketplace / Plugins", permission: "marketplace.read" },
  { id: "platform.settings.interface", label: "Interface", permission: "layout.read" },
];

function hasPermission(permissions: string[], permission: string) {
  return permissions.includes(permission) || permissions.includes("workspace.admin");
}

function selectedTabFromUrl(tabs: Array<NativeTab | RuntimeSettingsTab>) {
  const params = new URLSearchParams(window.location.search);
  const desired = params.get("tab") ?? (window.location.pathname === "/marketplace" ? "platform.settings.marketplace" : "");
  return tabs.find((tab) => tab.id === desired)?.id ?? tabs[0]?.id ?? "";
}

function roleLabels(rbac: RbacMe | null) {
  return rbac?.roles.map((role) => typeof role === "string" ? role : role.name).join(", ") || "none";
}

function memberRoleLabels(member: WorkspaceMember) {
  return member.roles.map((role) => role.name).join(", ") || "none";
}

function backendMessage(error: unknown, fallback: string) {
  if (error instanceof CoreRequestError) return `${error.status}${error.code ? ` ${error.code}` : ""}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return fallback;
}

const publicationDraftSchema = z.object({
  pluginId: z.string().min(1),
  contributionKind: z.enum(["route", "surface", "tool"]),
  contributionId: z.string().min(1),
  publicPath: z.string().min(1),
  title: z.string().min(1),
  access: z.enum(["anonymous", "authenticated"]),
  status: z.enum(["draft", "published", "unpublished", "disabled"]),
  authenticationMode: z.enum(["anonymous", "customer", "verified"]),
});

function GeneralPanel({ emit }: { emit: (item: Notification) => void }) {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState("Loading workspace settings...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadGeneralSettings().then((loaded) => {
      setSettings(loaded);
      setStatus("General settings loaded");
    }).catch((error) => setStatus(backendMessage(error, "General settings unavailable")));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const saved = await saveGeneralSettings(Object.fromEntries(form.entries()));
      setSettings(saved);
      setStatus("General settings saved");
      emit(notification("success", "Settings saved", "Workspace settings were updated."));
    } catch (error) {
      setStatus(backendMessage(error, "General settings could not be saved"));
      emit(notification("error", "Settings failed", backendMessage(error, "Core rejected the settings update.")));
    } finally {
      setBusy(false);
    }
  };

  const value = (key: string) => typeof settings[key] === "string" ? settings[key] as string : "";
  return <SurfaceCard>
    <div className="surface-header"><div><small>Core workspace</small><h2>General</h2><p>{status}</p></div></div>
    <form className="mail-form" onSubmit={submit}>
      <label>Workspace name<input name="workspaceName" defaultValue={value("workspaceName")} disabled={busy} /></label>
      <label>Business name<input name="businessDisplayName" defaultValue={value("businessDisplayName")} disabled={busy} /></label>
      <label>Locale<input name="locale" defaultValue={value("locale") || "ro-RO"} disabled={busy} /></label>
      <label>Timezone<input name="timezone" defaultValue={value("timezone") || "Europe/Bucharest"} disabled={busy} /></label>
      <label>Currency<input name="currency" defaultValue={value("currency") || "RON"} disabled={busy} /></label>
      <label>Public email<input name="contactEmailPublic" defaultValue={value("contactEmailPublic")} disabled={busy} /></label>
      <Button className="primary" type="submit" disabled={busy}>Save</Button>
    </form>
  </SurfaceCard>;
}

function SecurityAdministrationCrud({ emit }: { emit: (item: Notification) => void }) {
  const [installedPlugins, setInstalledPlugins] = useState<PluginManifest[]>([]);
  const [publications, setPublications] = useState<WorkspacePublication[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState("Loading security workspace data...");
  const [busy, setBusy] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    try {
      const [pluginsResult, publicationsResult, approvalsResult, auditResult] = await Promise.allSettled([
        loadInstalledPlugins(),
        loadWorkspacePublications(),
        loadPendingApprovalRequests(),
        loadAuditEvents(),
      ]);
      if (pluginsResult.status === "fulfilled") setInstalledPlugins(pluginsResult.value);
      if (publicationsResult.status === "fulfilled") setPublications(publicationsResult.value.publications);
      if (approvalsResult.status === "fulfilled") setApprovals(approvalsResult.value);
      if (auditResult.status === "fulfilled") setAuditEvents(auditResult.value.events);
      setStatus("Security records loaded");
    } catch (error) {
      setStatus(backendMessage(error, "Security records unavailable"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const parsePublicationValues = (values: Record<string, unknown>) => publicationDraftSchema.parse({
    pluginId: String(values.pluginId ?? ""),
    contributionKind: String(values.contributionKind ?? "route"),
    contributionId: String(values.contributionId ?? ""),
    publicPath: String(values.publicPath ?? "/"),
    title: String(values.title ?? ""),
    access: String(values.access ?? "authenticated"),
    status: String(values.status ?? "draft"),
    authenticationMode: String(values.authenticationMode ?? "anonymous"),
  });

  const createPublication = async (values: Record<string, unknown>) => {
    const parsed = parsePublicationValues(values);
    const publication = await createWorkspacePublication({
      pluginId: parsed.pluginId,
      contributionKind: parsed.contributionKind,
      contributionId: parsed.contributionId,
      publicPath: parsed.publicPath,
      title: parsed.title,
      access: parsed.access,
    });
    setPublications((current) => [publication, ...current.filter((item) => item.id !== publication.id)]);
    emit(notification("success", "Publication created", `${publication.title} is now tracked by Core.`));
    await refresh();
  };

  const updatePublication = async (row: Record<string, unknown>, values: Record<string, unknown>) => {
    const parsed = parsePublicationValues(values);
    const publicationId = String(row.id ?? "");
    const publication = await updateWorkspacePublication(publicationId, {
      title: parsed.title,
      publicPath: parsed.publicPath,
      status: parsed.status,
      access: parsed.access,
      authenticationMode: parsed.authenticationMode,
    });
    setPublications((current) => current.map((item) => item.id === publication.id ? publication : item));
    emit(notification("success", "Publication updated", `${publication.title} was saved.`));
    await refresh();
  };

  const deletePublication = async (row: Record<string, unknown>) => {
    const publicationId = String(row.id ?? "");
    await deleteWorkspacePublication(publicationId);
    setPublications((current) => current.filter((item) => item.id !== publicationId));
    emit(notification("success", "Publication deleted", `${String(row.title ?? publicationId)} was removed.`));
    await refresh();
  };

  const decideApproval = async (approvalId: string, decision: "approved" | "denied") => {
    setApprovalBusyId(approvalId);
    try {
      await decideApprovalRequest(approvalId, decision);
      await refresh();
      setStatus(`Approval ${decision}`);
      emit(notification("success", "Approval updated", `Request ${approvalId.slice(0, 8)} was ${decision}.`));
    } catch (error) {
      const message = backendMessage(error, "Approval decision failed");
      setStatus(message);
      emit(notification("error", "Approval failed", message));
    } finally {
      setApprovalBusyId(null);
    }
  };

  const pluginOptions = installedPlugins.filter((plugin) => plugin.id).map((plugin) => ({ id: plugin.id, name: plugin.name }));

  return <section className="settings-subpanel">
    <CrudRenderer
      title="Publications"
      status={status}
      busy={busy}
      rows={publications}
      columns={[
        { id: "title", label: "Publication", field: "title", type: "text", sortable: false },
        { id: "publicPath", label: "Path", field: "publicPath", type: "text", sortable: false },
        { id: "pluginId", label: "Plugin", field: "pluginId", type: "text", sortable: false },
        { id: "access", label: "Access", field: "access", type: "text", sortable: false },
        { id: "status", label: "Status", field: "status", type: "badge", sortable: false },
      ]}
      fields={[
        { id: "pluginId", label: "Plugin", type: "select", required: true, readOnly: false, options: pluginOptions.map((plugin) => ({ value: plugin.id, label: `${plugin.name} (${plugin.id})` })) },
        { id: "contributionKind", label: "Contribution kind", type: "select", required: true, readOnly: false, options: [{ value: "route", label: "Route" }, { value: "surface", label: "Surface" }, { value: "tool", label: "Tool" }] },
        { id: "contributionId", label: "Contribution ID", type: "text", required: true, readOnly: false, options: [] },
        { id: "publicPath", label: "Public path", type: "text", required: true, readOnly: false, options: [] },
        { id: "title", label: "Title", type: "text", required: true, readOnly: false, options: [] },
        { id: "access", label: "Access", type: "select", required: true, readOnly: false, options: [{ value: "anonymous", label: "Anonymous" }, { value: "authenticated", label: "Authenticated" }] },
        { id: "status", label: "Status", type: "select", required: true, readOnly: false, options: [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "unpublished", label: "Unpublished" }, { value: "disabled", label: "Disabled" }] },
        { id: "authenticationMode", label: "Authentication mode", type: "select", required: true, readOnly: false, options: [{ value: "anonymous", label: "Anonymous" }, { value: "customer", label: "Customer" }, { value: "verified", label: "Verified" }] },
      ]}
      crud={{
        entityLabel: "Publication",
        entityLabelPlural: "Publications",
        rowIdField: "id",
        rowTitleField: "title",
        createActionId: "platform.publications.create",
        updateActionId: "platform.publications.update",
        deleteActionId: "platform.publications.delete",
      }}
      onRefresh={() => void refresh()}
      onCreate={createPublication}
      onUpdate={updatePublication}
      onDelete={deletePublication}
    />
    <div className="settings-grid" style={{ marginTop: "1rem" }}>
      <section className="settings-subpanel">
        <h3>Pending approvals</h3>
        <div className="template-table-wrap domain-table">
          <table>
            <thead>
              <tr><th>Request</th><th>Plugin</th><th>Risk</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {approvals.map((approval) => (
                <tr key={approval.id}>
                  <td><strong>{approval.kind}</strong><small>{approval.subjectId}</small></td>
                  <td>{approval.pluginId ?? "platform"}</td>
                  <td>{approval.risk}</td>
                  <td>{new Date(approval.requestedAt).toLocaleString()}</td>
                  <td>
                    <div className="plugin-actions">
                      <Button disabled={approvalBusyId === approval.id} onClick={() => void decideApproval(approval.id, "denied")}>Deny</Button>
                      <Button disabled={approvalBusyId === approval.id} onClick={() => void decideApproval(approval.id, "approved")}>Approve</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="settings-subpanel">
        <h3>Audit events</h3>
        <div className="template-table-wrap domain-table">
          <table>
            <thead>
              <tr><th>Action</th><th>Actor</th><th>Time</th></tr>
            </thead>
            <tbody>
              {auditEvents.map((event) => (
                <tr key={event.id}>
                  <td><strong>{event.action}</strong><small>{event.workspaceId ?? "platform"}</small></td>
                  <td>{event.actorId ?? "system"}</td>
                  <td>{new Date(event.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </section>;
}

function SecurityPanel({ emit }: { emit: (item: Notification) => void }) {
  const [summary, setSummary] = useState<AuthSecuritySummary | null>(null);
  const [sessions, setSessions] = useState<{ sessions: number; passkeys: number } | null>(null);
  const [rbac, setRbac] = useState<RbacMe | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [mailAvailable, setMailAvailable] = useState(false);
  const [status, setStatus] = useState("Loading security controls...");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const [loaded, memberList] = await Promise.all([loadSecurityBootstrap(), loadWorkspaceMembers()]);
      setSummary(loaded.summary);
      setSessions(loaded.sessions);
      setRbac(loaded.rbac);
      setMembers(memberList);
      setMailAvailable(loaded.mail.activeTransactionalProvider);
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
    } catch (error) {
      const message = backendMessage(error, "Security policy could not be saved");
      setStatus(message);
      emit(notification("error", "Auth policy failed", message));
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
    } catch (error) {
      const message = backendMessage(error, "Auth method could not be saved");
      setStatus(message);
      emit(notification("error", "Auth method failed", message));
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
        <h3>Workspace access</h3>
        <div className="settings-access-grid">
          <div className="settings-access-card">
            <small>Current user</small>
            <strong>{rbac?.user?.email ?? "unknown"}</strong>
            <p>Roles: {roleLabels(rbac)}</p>
            <p>Permissions: {rbac?.permissions.length ?? 0}</p>
          </div>
          <div className="settings-access-card">
            <small>Memberships</small>
            <strong>{members.length}</strong>
            <p>Active and invited workspace members visible in Core.</p>
          </div>
          <div className="settings-access-card">
            <small>Active sessions</small>
            <strong>{sessions?.sessions ?? 0}</strong>
            <p>Passkeys: {sessions?.passkeys ?? 0}. Published login slots: {summary.publishedLoginContributions}.</p>
          </div>
        </div>
        <div className="template-table-wrap domain-table settings-member-table">
          <table>
            <thead>
              <tr><th>User</th><th>Status</th><th>Roles</th><th>Permissions</th></tr>
            </thead>
            <tbody>
              {members.map((member) => <tr key={member.user.id}>
                <td><strong>{member.user.email ?? member.user.id}</strong><small>{member.user.id}</small></td>
                <td><span className={`status-pill ${member.status}`}>{member.status}</span></td>
                <td>{memberRoleLabels(member)}</td>
                <td>{member.permissions.length}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
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
        <label className="template-check"><input type="checkbox" disabled={busy || !mailAvailable} checked={summary.policy.requireEmailVerification} onChange={(event) => void updatePolicy({ requireEmailVerification: event.currentTarget.checked })} />Require email verification</label>
        <p>Email delivery: {summary.emailDelivery.status}. Verification/reset stay unavailable until a server-side mail adapter is configured.</p>
        {!mailAvailable ? <p className="message">Email verification is disabled until Mail Delivery has an active transactional provider.</p> : null}
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
        {rbac?.recoveryAdmin ? <p className="message">Bootstrap/recovery admin is active for this user until RBAC ownership is fully assigned.</p> : null}
      </section>
    </div> : null}
    <SecurityAdministrationCrud emit={emit} />
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
        <option value="mail">Mail sender</option>
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

function MailDeliveryPanel({ emit }: { emit: (item: Notification) => void }) {
  const [summary, setSummary] = useState<MailSummary | null>(null);
  const [status, setStatus] = useState("Loading mail runtime...");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const loaded = await loadMailSummary();
      setSummary(loaded);
      setStatus(loaded.activeProvider ? `Active provider: ${loaded.activeProvider.label}` : "No active transactional provider");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Mail runtime unavailable"));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind") ?? "transactional-http") as "smtp" | "transactional-http" | "mock-development-only";
    setBusy(true);
    try {
      const loaded = await configureMailProvider({
        kind,
        label: String(form.get("label") ?? "SMTP"),
        fromName: String(form.get("fromName") ?? ""),
        fromEmail: String(form.get("fromEmail") ?? ""),
        replyToEmail: String(form.get("replyToEmail") || "") || null,
        configurationRef: String(form.get("configurationRef") || "") || null,
        enabled: true,
        safeConfig: {
          host: String(form.get("host") || "") || undefined,
          port: Number(form.get("port") || 587),
          secure: String(form.get("secure") || "starttls") as "none" | "starttls" | "tls",
          usernameConfigured: Boolean(String(form.get("configurationRef") || "")),
          passwordConfigured: Boolean(String(form.get("configurationRef") || "")),
          secretHint: String(form.get("configurationRef") || "") ? "stored server-side by reference" : null,
        },
      });
      setSummary(loaded);
      setStatus("Mail provider saved");
      event.currentTarget.reset();
      emit(notification("success", "Mail provider saved", "Core stored safe metadata and only a secret reference."));
    } catch {
      setStatus("Mail provider could not be saved");
      emit(notification("error", "Mail provider failed", "Core rejected the mail provider configuration."));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (label: string, action: () => Promise<MailSummary>) => {
    setBusy(true);
    try {
      const loaded = await action();
      setSummary(loaded);
      setStatus(label);
      emit(notification("success", label, "Mail Runtime state was updated."));
    } catch {
      setStatus(`${label} failed`);
      emit(notification("error", label, "Core rejected the mail runtime action."));
    } finally {
      setBusy(false);
    }
  };

  const test = async (providerId: string) => {
    const to = window.prompt("Test recipient email");
    if (!to) return;
    setBusy(true);
    try {
      const result = await testMailProvider(providerId, to);
      setStatus(result.message);
      emit(notification(result.ok ? "success" : "error", "Mail test", result.message));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return <SurfaceCard>
    <div className="surface-header">
      <div><small>Core Mail Runtime</small><h2>Mail Delivery</h2><p>{status}</p></div>
      <Button onClick={() => void refresh()} disabled={busy}>Refresh</Button>
    </div>
    <form className="mail-form" onSubmit={submit}>
      <label>Kind<select name="kind" defaultValue="transactional-http" disabled={busy}><option value="transactional-http">Transactional HTTP</option><option value="smtp">SMTP</option><option value="mock-development-only">Mock dev-only</option></select></label>
      <label>Label<input name="label" placeholder="Transactional SMTP" required disabled={busy} /></label>
      <label>From name<input name="fromName" placeholder="Print Center" required disabled={busy} /></label>
      <label>From email<input name="fromEmail" type="email" placeholder="no-reply@example.com" required disabled={busy} /></label>
      <label>Reply-to<input name="replyToEmail" type="email" placeholder="support@example.com" disabled={busy} /></label>
      <label>SMTP host<input name="host" placeholder="smtp.example.com" disabled={busy} /></label>
      <label>Port<input name="port" type="number" defaultValue={587} disabled={busy} /></label>
      <label>Secure<select name="secure" defaultValue="starttls" disabled={busy}><option value="starttls">STARTTLS</option><option value="tls">TLS</option><option value="none">None</option></select></label>
      <label>Secret ref<input name="configurationRef" placeholder="secret://workspace/default/smtp" disabled={busy} /></label>
      <Button className="primary" type="submit" disabled={busy}>Add provider</Button>
    </form>
    {summary ? <div className="settings-grid">
      <section className="settings-subpanel">
        <h3>Providers</h3>
        <div className="plugin-list">{summary.providers.map((provider) => <div className="plugin-row" key={provider.id}>
          <div><strong>{provider.label}</strong><small>{provider.kind} · {provider.status} · {provider.fromEmail} · secret {provider.safeConfig.passwordConfigured ? "configured" : "missing"}</small></div>
          <div className="plugin-actions">
            <Button disabled={busy || provider.isDefaultTransactional} onClick={() => void apply("Mail provider activated", () => activateMailProvider(provider.id))}>Activate</Button>
            <Button disabled={busy} onClick={() => void test(provider.id)}>Test</Button>
            <Button disabled={busy || provider.status === "disabled"} onClick={() => void apply("Mail provider disabled", () => disableMailProvider(provider.id))}>Disable</Button>
          </div>
        </div>)}</div>
      </section>
      <section className="settings-subpanel">
        <h3>Templates</h3>
        <div className="plugin-list">{summary.templates.map((template) => <div className="plugin-row" key={template.id}><div><strong>{template.templateKey}</strong><small>{template.status} · {template.locale} · {template.subjectTemplate}</small></div></div>)}</div>
      </section>
      <section className="settings-subpanel">
        <h3>Recent delivery</h3>
        <div className="plugin-list">{summary.events.map((event) => <div className="plugin-row" key={event.id}><div><strong>{event.purpose}</strong><small>{event.status} · {event.template_key ?? "direct"} · {event.error_safe ?? "no safe error"}</small></div></div>)}</div>
      </section>
    </div> : null}
  </SurfaceCard>;
}

export function SettingsPage({ shell, onShellChange, emit, workspace, permissions, onRuntimeChanged }: SettingsPageProps) {
  const [tabs, setTabs] = useState<RuntimeSettingsTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState("");
  const [resolution, setResolution] = useState<RuntimeSettingsTabResolution | null>(null);
  const [marketplacePlugins, setMarketplacePlugins] = useState<MarketplacePlugin[]>([]);
  const [status, setStatus] = useState("Settings ready");

  const visibleNativeTabs = useMemo(() => nativeTabs.filter((tab) => hasPermission(permissions, tab.permission)), [permissions]);
  const allTabs = useMemo(() => [...visibleNativeTabs, ...tabs], [tabs, visibleNativeTabs]);
  const selectedTab = useMemo(() => allTabs.find((tab) => tab.id === selectedTabId) ?? null, [selectedTabId, allTabs]);
  const selectedPluginTab = useMemo(() => tabs.find((tab) => tab.id === selectedTabId) ?? null, [selectedTabId, tabs]);
  const selectedTabSource = selectedPluginTab ? selectedPluginTab.ownerName : selectedTabId.startsWith("platform.settings.") ? "Platform" : "Runtime";
  const selectedTabMode = selectedPluginTab ? "Plugin contribution" : selectedTabId.startsWith("platform.settings.") ? "Built-in tab" : "Runtime tab";

  useEffect(() => {
    let alive = true;
    void loadSettingsTabs().then((loaded) => {
      if (!alive) return;
      setTabs(loaded);
      const nextTabs = [...visibleNativeTabs, ...loaded];
      setSelectedTabId(selectedTabFromUrl(nextTabs));
      setStatus(loaded.length ? "Settings ready with plugin tabs" : "Platform Settings ready");
    }).catch((error) => {
      if (!alive) return;
      setStatus(error instanceof Error ? error.message : "Plugin Settings registry unavailable");
      setSelectedTabId(selectedTabFromUrl(visibleNativeTabs));
    });
    return () => { alive = false; };
  }, [visibleNativeTabs]);

  useEffect(() => {
    if (!selectedTabId) return;
    const nextUrl = `/settings?tab=${encodeURIComponent(selectedTabId)}`;
    if (window.location.pathname !== "/settings" || window.location.search !== `?tab=${encodeURIComponent(selectedTabId)}`) window.history.replaceState(null, "", nextUrl);
    if (selectedTabId.startsWith("platform.settings.")) {
      setResolution(null);
      setStatus("Platform Settings ready");
      return;
    }
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
    <header className="settings-header">
      <div className="settings-header-copy">
        <small>{workspace?.id ?? "no-workspace"}</small>
        <h2>Settings</h2>
        <p>{status}</p>
        <span className="settings-meta">{selectedTab ? `${selectedTabMode} · ${selectedTabSource} · ${selectedTab.label}` : "No tab selected"}</span>
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
        {!selectedTab ? <SurfaceCard><h2>No Settings tab</h2><p>No active Settings contribution is available for this workspace.</p></SurfaceCard> : null}
        {selectedPluginTab && !resolution ? <SurfaceCard><h2>{selectedPluginTab.label}</h2><p>Loading plugin panel contribution...</p></SurfaceCard> : null}
        {resolution ? <TemplateRenderer page={resolution.panel.schema} runtime={{ contributionId: resolution.panel.id }} /> : null}
        {selectedTabId === "platform.settings.general" ? <GeneralPanel emit={emit} /> : null}
        {selectedTabId === "platform.settings.marketplace" ? <PluginManagerPanel plugins={marketplacePlugins.map((item) => item.manifest)} activePluginIds={new Set(marketplacePlugins.filter((item) => item.active).map((item) => item.manifest.id))} permissions={permissions} onChanged={() => void refreshRuntime()} /> : null}
        {selectedTabId === "platform.settings.interface" ? <RuntimeShellEditor state={shell} onChange={onShellChange} /> : null}
        {selectedTabId === "platform.settings.security" ? <SecurityPanel emit={emit} /> : null}
        {selectedTabId === "platform.settings.domains" ? <DomainsPanel emit={emit} /> : null}
        {selectedTabId === "platform.settings.mail" ? <MailDeliveryPanel emit={emit} /> : null}
      </section>
    </div>
  </div>;
}
