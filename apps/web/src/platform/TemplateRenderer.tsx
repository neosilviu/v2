import type { ActionDefinition, DeclarativePageContribution, FieldDefinition, SlotContribution, TemplateId } from "@v2/ui-schema";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { executePublicRuntimeAction, executeRuntimeAction, loadPublicRuntimeData, loadRuntimeData } from "../api";
import { CrudRenderer } from "./CrudRenderer";

export type TemplateCallbacks = {
  onAction?: (action: ActionDefinition) => void | Promise<void>;
  onSubmit?: (page: DeclarativePageContribution, values: Record<string, FormDataEntryValue>) => void | Promise<void>;
};

export type TemplateRendererProps = {
  page: DeclarativePageContribution;
  data?: unknown;
  callbacks?: TemplateCallbacks | undefined;
  runtime?: { contributionId?: string; pluginId?: string; public?: boolean; workspaceId?: string; routeParams?: Record<string, string> } | undefined;
};

function valueAt(row: unknown, field: string): string {
  if (!row || typeof row !== "object") return "";
  const value = (row as Record<string, unknown>)[field];
  if (value === null || value === undefined) return "";
  return String(value);
}

function rowsFrom(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { rows?: unknown[] }).rows)) return (data as { rows: unknown[] }).rows;
  return [];
}

function slotItems(slots: SlotContribution[], slot: string) {
  return slots.filter((item) => item.slot === slot).sort((left, right) => left.displayOrder - right.displayOrder);
}

function Slot({ slots, slot }: { slots: SlotContribution[]; slot: string }) {
  const items = slotItems(slots, slot);
  if (!items.length) return null;
  return <div className="template-slot" data-slot={slot}>{items.flatMap((item) => item.blocks.map((block, index) => {
    if (block.type === "heading") {
      const Tag = block.level;
      return <Tag key={`${item.id}-${index}`}>{block.text}</Tag>;
    }
    if (block.type === "metric") return <div className="declarative-metric" key={`${item.id}-${index}`}><small>{block.label}</small><strong>{block.value}</strong>{block.detail ? <p>{block.detail}</p> : null}</div>;
    if (block.type === "image") return <img className="template-image" key={`${item.id}-${index}`} src={block.src} alt={block.alt} />;
    return <p key={`${item.id}-${index}`} className={`declarative-text ${block.tone}`}>{block.text}</p>;
  }))}</div>;
}

function Actions({ actions, callbacks }: { actions: ActionDefinition[]; callbacks?: TemplateCallbacks | undefined }) {
  if (!actions.length) return null;
  return <div className="actions">{actions.map((action) => <Button key={action.id} className={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : ""} onClick={() => void callbacks?.onAction?.(action)}>{action.title}</Button>)}</div>;
}

function templateLabel(templateId: TemplateId) {
  if (templateId.startsWith("public.")) return "Public experience";
  if (templateId.includes("profile")) return "Account";
  if (templateId.includes("chat")) return "Conversation";
  if (templateId.includes("settings")) return "Settings";
  if (templateId.includes("table") || templateId.includes("crud") || templateId.includes("approvals")) return "Records";
  if (templateId.includes("form") || templateId.includes("detail")) return "Details";
  return "Workspace page";
}

function fieldValue(data: unknown, id: string) {
  if (!data || typeof data !== "object") return undefined;
  return (data as Record<string, unknown>)[id];
}

function Field({ field, data }: { field: FieldDefinition; data?: unknown }) {
  const value = fieldValue(data, field.id);
  const defaultValue = value === undefined || value === null ? "" : String(value);
  if (field.type === "textarea") return <label>{field.label}<textarea name={field.id} required={field.required} readOnly={field.readOnly} defaultValue={defaultValue} /></label>;
  if (field.type === "select") return <label>{field.label}<select name={field.id} required={field.required} disabled={field.readOnly} defaultValue={defaultValue}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (field.type === "boolean") return <label className="template-check"><input name={field.id} type="checkbox" disabled={field.readOnly} defaultChecked={value === true || value === "true"} />{field.label}</label>;
  return <label>{field.label}<input name={field.id} type={field.type === "password" ? "password" : field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "color" ? "color" : "text"} required={field.required} readOnly={field.readOnly} autoComplete={field.autocomplete} defaultValue={defaultValue} /></label>;
}

function AdminTable({ page, data, callbacks }: TemplateRendererProps) {
  const rows = rowsFrom(data ?? page.data);
  return <SurfaceCard className="template-page template-table"><div className="surface-header"><div><small>{templateLabel(page.templateId)}</small><h2>{page.title}</h2></div><Badge>{rows.length}</Badge></div><Slot slots={page.slots} slot="header" /><div className="template-table-wrap"><table><thead><tr>{page.columns.map((column) => <th key={column.id}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{page.columns.map((column) => <td key={column.id}>{valueAt(row, column.field)}</td>)}</tr>)}</tbody></table></div><Actions actions={page.actions} callbacks={callbacks} /></SurfaceCard>;
}

function AdminForm({ page, data, callbacks }: TemplateRendererProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void callbacks?.onSubmit?.(page, Object.fromEntries(new FormData(event.currentTarget)));
  };
  return <SurfaceCard className="template-page template-form"><div className="surface-header"><div><small>{templateLabel(page.templateId)}</small><h2>{page.title}</h2></div><Badge>{page.fields.length}</Badge></div><Slot slots={page.slots} slot="header" /><form onSubmit={submit}>{page.fields.map((field) => <Field key={`${field.id}:${fieldValue(data, field.id) ?? ""}`} field={field} data={data} />)}<Actions actions={page.actions} callbacks={callbacks} /></form></SurfaceCard>;
}

function AdminSettings(props: TemplateRendererProps) {
  return <AdminForm {...props} />;
}

function AccountProfile({ page, data, callbacks }: TemplateRendererProps) {
  const source = (data ?? page.data) as {
    profile?: { name?: string | null; email?: string | null; emailVerified?: boolean; passkeys?: number; sessions?: number; isPlatformAdmin?: boolean };
    workspaces?: Array<{ id: string; name: string; status: string; roles?: Array<{ name: string }> }>;
    currentWorkspace?: { id: string; name: string; status: string; roles?: Array<{ name: string }> } | null;
  } | undefined;
  const profile = source?.profile ?? {};
  const workspaces = source?.workspaces ?? [];
  const currentWorkspace = source?.currentWorkspace ?? null;
  const saveAction = page.actions.find((item) => item.commandId === "platform.account.profile.save") ?? page.actions.find((item) => item.intent === "submit") ?? page.actions[0];
  const signOutAction = page.actions.find((item) => item.commandId === "platform.account.sign-out");
  const stats = [
    { label: "Name", value: profile.name?.trim() || "unknown" },
    { label: "Email", value: profile.email || "unknown" },
    { label: "Passkeys", value: String(profile.passkeys ?? 0) },
    { label: "Sessions", value: String(profile.sessions ?? 0) },
  ];
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void callbacks?.onSubmit?.(page, Object.fromEntries(new FormData(event.currentTarget)));
  };
  return <div className="page-stack">
    <SurfaceCard>
      <div className="surface-header">
        <div>
          <small>Profile</small>
          <h2>{page.title}</h2>
          <p>Your account details and security settings.</p>
        </div>
        <Badge>{profile.emailVerified ? "verified" : "account"}</Badge>
      </div>
      <div className="account-metrics">
        {stats.map((item) => <div className="account-metric" key={item.label}><small>{item.label}</small><strong>{item.value}</strong></div>)}
      </div>
      <form className="profile-form" onSubmit={submit}>
        <label className="field">Display name<input name="name" defaultValue={profile.name ?? ""} placeholder="Your name" autoComplete="name" /></label>
        <div className="actions">
          {saveAction ? <Button className={saveAction.variant === "primary" ? "primary" : ""} type="submit">{saveAction.title}</Button> : null}
        </div>
      </form>
    </SurfaceCard>
    <div className="settings-grid">
      <section className="settings-subpanel">
        <h3>Workspace</h3>
        <p>{currentWorkspace?.name ?? "Current workspace"}</p>
        <p>{currentWorkspace?.roles?.map((role) => role.name).join(", ") || "Member"}</p>
        <div className="settings-subpanel-table">
          {workspaces.map((workspace) => <div className="settings-subpanel-row" key={workspace.id}>
            <div>
              <strong>{workspace.name}</strong>
              <small>{workspace.id === currentWorkspace?.id ? "Current workspace" : "Available workspace"}</small>
            </div>
            <Badge>{workspace.status}</Badge>
          </div>)}
        </div>
      </section>
      <section className="settings-subpanel">
        <h3>Security</h3>
        <p>{profile.passkeys ? `${profile.passkeys} passkey${profile.passkeys === 1 ? "" : "s"} enrolled.` : "No passkeys are enrolled yet."}</p>
        <p>{profile.sessions ? `${profile.sessions} active session${profile.sessions === 1 ? "" : "s"} tracked.` : "Current browser session is active."}</p>
        <div className="settings-subpanel-row">
          <div>
            <strong>{profile.emailVerified ? "Email verified" : "Email not verified"}</strong>
            <small>{profile.email ? "User account" : "Account"}</small>
          </div>
          <Badge>{profile.passkeys ?? 0} passkeys</Badge>
        </div>
      </section>
      {signOutAction ? <section className="settings-subpanel">
        <h3>Logout</h3>
        <p>End the current browser session and return to login.</p>
        <div className="actions"><Button className={signOutAction.variant === "danger" ? "danger" : ""} onClick={() => void callbacks?.onAction?.(signOutAction)}>{signOutAction.title}</Button></div>
      </section> : null}
    </div>
  </div>;
}

function AdminChat({ page, data, callbacks }: TemplateRendererProps) {
  const messages = rowsFrom(data ?? page.data);
  return <SurfaceCard className="template-page template-chat"><div className="surface-header"><div><small>{templateLabel(page.templateId)}</small><h2>{page.title}</h2></div><Badge>{messages.length}</Badge></div><Slot slots={page.slots} slot="header" /><div className="chat-messages">{messages.map((message, index) => <div key={index} className={`chat-message ${valueAt(message, "role") || "system"}`}><strong>{valueAt(message, "title") || valueAt(message, "role")}</strong><p>{valueAt(message, "content")}</p></div>)}</div><Actions actions={page.actions} callbacks={callbacks} /></SurfaceCard>;
}

function AuthLogin({ page, data, callbacks }: TemplateRendererProps) {
  return <SurfaceCard className="template-page template-auth"><div className="surface-header"><div><small>Sign in</small><h2>{page.title}</h2></div><Badge>public</Badge></div><Slot slots={page.slots} slot="login.header" /><Slot slots={page.slots} slot="login.branding" /><AdminForm page={page} data={data} callbacks={callbacks} /><Slot slots={page.slots} slot="login.footer" /><Slot slots={page.slots} slot="login.legal" /></SurfaceCard>;
}

function PublicContentPage({ page }: TemplateRendererProps) {
  return <article className="template-page public-content"><Slot slots={page.slots} slot="hero" /><Slot slots={page.slots} slot="body" /><Actions actions={page.actions} /></article>;
}

const registry: Record<TemplateId, (props: TemplateRendererProps) => ReactElement> = {
  "admin.dashboard": AdminTable,
  "admin.crud": AdminTable,
  "admin.table": AdminTable,
  "admin.detail": AdminForm,
  "admin.form": AdminForm,
  "admin.settings": AdminSettings,
  "account.profile": AccountProfile,
  "admin.approvals": AdminTable,
  "admin.chat": AdminChat,
  "auth.login": AuthLogin,
  "public.contentPage": PublicContentPage,
  "public.productGrid": AdminTable,
  "public.productDetail": AdminForm,
  "public.cart": AdminTable,
  "public.checkout": AdminForm,
  "public.chat": AdminChat,
};

const nativePlatformPanels = new Set([
  "platform.settings.security.panel",
  "platform.settings.domains.panel",
  "platform.settings.mail.panel",
  "platform.settings.marketplace.panel",
  "platform.settings.interface.panel",
]);

function isNativePlatformSettingsPanel(contributionId: string): boolean {
  return nativePlatformPanels.has(contributionId);
}

export function TemplateRenderer(props: TemplateRendererProps) {
  const [runtimeData, setRuntimeData] = useState<unknown>(props.data ?? props.page.data);
  const [status, setStatus] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const contributionId = props.runtime?.contributionId ?? props.page.id;
  const routeParams = props.runtime?.routeParams ?? {};
  const routeParamsKey = JSON.stringify(routeParams);
  const nativePlatformPanel = isNativePlatformSettingsPanel(contributionId);
  const dataSources = nativePlatformPanel ? [] : props.runtime?.public ? props.page.dataSources : props.page.dataSources.filter((dataSource) => dataSource.access !== "public-candidate");
  const dataSourceKey = dataSources.map((dataSource) => dataSource.id).join("|");
  const isCrudPage = Boolean(props.page.crud);

  useEffect(() => {
    let alive = true;
    if (!dataSources.length) {
      setStatus(null);
      setRuntimeData(props.data ?? props.page.data);
      return () => { alive = false; };
    }
    setStatus("Loading data...");
    void Promise.all(dataSources.map(async (dataSource) => {
      const result = props.runtime?.public
        ? await loadPublicRuntimeData(contributionId, dataSource.id, routeParams, props.runtime.workspaceId)
        : await loadRuntimeData(contributionId, dataSource.id, routeParams);
      return { id: dataSource.id, result };
    })).then((results) => {
      if (!alive) return;
      const failed = results.find((item) => item.result.status !== "ok");
      if (failed) {
        setStatus(failed.result.error ?? failed.result.status);
        return;
      }
      setStatus(null);
      setRuntimeData(results.length === 1 ? results[0]!.result.data : Object.fromEntries(results.map((item) => [item.id, item.result.data])));
    }).catch((error: unknown) => {
      if (alive) setStatus(error instanceof Error ? error.message : "Runtime data unavailable");
    });
    return () => { alive = false; };
  }, [contributionId, dataSourceKey, props.data, props.page, props.runtime?.public, props.runtime?.workspaceId, routeParamsKey, refreshNonce]);

  const dispatchAction = async (action: ActionDefinition, input?: unknown): Promise<boolean> => {
    if (props.callbacks?.onAction && input === undefined) {
      await props.callbacks.onAction(action);
      return true;
    }
    setStatus("Saving changes...");
    try {
      const result = props.runtime?.public
        ? await executePublicRuntimeAction(contributionId, action.id, input, routeParams, props.runtime.workspaceId)
        : await executeRuntimeAction(contributionId, action.id, input, routeParams);
      if (result.status === "ok") {
        if (result.data !== null && result.data !== undefined) setRuntimeData(result.data);
        setStatus("Changes saved successfully.");
        for (const effect of action.effects) {
          if (effect.type === "refresh") setRefreshNonce((value) => value + 1);
          if (effect.type === "navigate") window.location.assign(effect.to);
        }
        return true;
      }
      setStatus(result.approvalId ? `Approval required: ${result.approvalId.slice(0, 8)}` : result.error ?? result.status);
      return false;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Changes could not be saved.");
      return false;
    }
  };

  if (nativePlatformPanel) return null;
  const crud = props.page.crud;
  if (isCrudPage && crud) {
    const rows = rowsFrom(runtimeData ?? props.page.data);
    const crudAction = (id: string) => {
      const action = props.page.actions.find((candidate) => candidate.id === id);
      if (!action) throw new Error(`CRUD action ${id} is not declared on ${props.page.id}.`);
      return action;
    };
    return <div className="template-runtime">
      {status ? <p className="message">{status}</p> : null}
      <CrudRenderer
        title={props.page.title}
        status={status ?? undefined}
        rows={rows.map((row) => row && typeof row === "object" ? row as Record<string, unknown> : {})}
        columns={props.page.columns}
        fields={props.page.fields}
        crud={crud}
        onRefresh={() => setRefreshNonce((value) => value + 1)}
        onCreate={async (values) => {
          const succeeded = await dispatchAction(crudAction(crud.createActionId), values);
          if (succeeded) setRefreshNonce((value) => value + 1);
          return succeeded;
        }}
        onUpdate={async (row, values) => {
          const succeeded = await dispatchAction(crudAction(crud.updateActionId), { ...values, [crud.rowIdField]: row[crud.rowIdField] });
          if (succeeded) setRefreshNonce((value) => value + 1);
          return succeeded;
        }}
        onDelete={async (row) => {
          const succeeded = await dispatchAction(crudAction(crud.deleteActionId), { [crud.rowIdField]: row[crud.rowIdField] });
          if (succeeded) setRefreshNonce((value) => value + 1);
          return succeeded;
        }}
      />
    </div>;
  }
  const Template = registry[props.page.templateId];
  return <div className="template-runtime">
    {status ? <p className="message">{status}</p> : null}
    <Template {...props} data={runtimeData} callbacks={{
      ...props.callbacks,
      onAction: (action) => { void dispatchAction(action); },
      onSubmit: (page, values) => {
        if (props.callbacks?.onSubmit) return props.callbacks.onSubmit(page, values);
        const action = page.actions.find((item) => item.intent === "submit") ?? page.actions[0];
        if (action) void dispatchAction(action, values);
      },
    }} />
  </div>;
}
