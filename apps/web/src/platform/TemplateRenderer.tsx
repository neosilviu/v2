import type { ActionDefinition, DeclarativePageContribution, FieldDefinition, SlotContribution, TemplateId } from "@v2/ui-schema";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { executePublicRuntimeAction, executeRuntimeAction, loadPublicRuntimeData, loadRuntimeData } from "../api";

export type TemplateCallbacks = {
  onAction?: (action: ActionDefinition) => void | Promise<void>;
  onSubmit?: (page: DeclarativePageContribution, values: Record<string, FormDataEntryValue>) => void | Promise<void>;
};

export type TemplateRendererProps = {
  page: DeclarativePageContribution;
  data?: unknown;
  callbacks?: TemplateCallbacks | undefined;
  runtime?: { contributionId?: string; public?: boolean; workspaceId?: string; routeParams?: Record<string, string> } | undefined;
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

function Field({ field }: { field: FieldDefinition }) {
  if (field.type === "textarea") return <label>{field.label}<textarea name={field.id} required={field.required} readOnly={field.readOnly} /></label>;
  if (field.type === "select") return <label>{field.label}<select name={field.id} required={field.required} disabled={field.readOnly}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (field.type === "boolean") return <label className="template-check"><input name={field.id} type="checkbox" disabled={field.readOnly} />{field.label}</label>;
  return <label>{field.label}<input name={field.id} type={field.type === "password" ? "password" : field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "color" ? "color" : "text"} required={field.required} readOnly={field.readOnly} autoComplete={field.autocomplete} /></label>;
}

function AdminTable({ page, data, callbacks }: TemplateRendererProps) {
  const rows = rowsFrom(data ?? page.data);
  return <SurfaceCard className="template-page template-table"><div className="surface-header"><div><small>{page.templateId}</small><h2>{page.title}</h2></div><Badge>{rows.length}</Badge></div><Slot slots={page.slots} slot="header" /><div className="template-table-wrap"><table><thead><tr>{page.columns.map((column) => <th key={column.id}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{page.columns.map((column) => <td key={column.id}>{valueAt(row, column.field)}</td>)}</tr>)}</tbody></table></div><Actions actions={page.actions} callbacks={callbacks} /></SurfaceCard>;
}

function AdminForm({ page, callbacks }: TemplateRendererProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void callbacks?.onSubmit?.(page, Object.fromEntries(new FormData(event.currentTarget)));
  };
  return <SurfaceCard className="template-page template-form"><div className="surface-header"><div><small>{page.templateId}</small><h2>{page.title}</h2></div><Badge>{page.fields.length}</Badge></div><Slot slots={page.slots} slot="header" /><form onSubmit={submit}>{page.fields.map((field) => <Field key={field.id} field={field} />)}<Actions actions={page.actions} callbacks={callbacks} /></form></SurfaceCard>;
}

function AdminSettings(props: TemplateRendererProps) {
  return <AdminForm {...props} />;
}

function AdminChat({ page, data, callbacks }: TemplateRendererProps) {
  const messages = rowsFrom(data ?? page.data);
  return <SurfaceCard className="template-page template-chat"><div className="surface-header"><div><small>{page.templateId}</small><h2>{page.title}</h2></div><Badge>{messages.length}</Badge></div><Slot slots={page.slots} slot="header" /><div className="chat-messages">{messages.map((message, index) => <div key={index} className={`chat-message ${valueAt(message, "role") || "system"}`}><strong>{valueAt(message, "title") || valueAt(message, "role")}</strong><p>{valueAt(message, "content")}</p></div>)}</div><Actions actions={page.actions} callbacks={callbacks} /></SurfaceCard>;
}

function AuthLogin({ page, data, callbacks }: TemplateRendererProps) {
  return <SurfaceCard className="template-page template-auth"><div className="surface-header"><div><small>{page.templateId}</small><h2>{page.title}</h2></div><Badge>public</Badge></div><Slot slots={page.slots} slot="login.header" /><Slot slots={page.slots} slot="login.branding" /><AdminForm page={page} data={data} callbacks={callbacks} /><Slot slots={page.slots} slot="login.footer" /><Slot slots={page.slots} slot="login.legal" /></SurfaceCard>;
}

function PublicContentPage({ page }: TemplateRendererProps) {
  return <article className="template-page public-content"><Slot slots={page.slots} slot="hero" /><Slot slots={page.slots} slot="body" /><Actions actions={page.actions} /></article>;
}

const registry: Record<TemplateId, (props: TemplateRendererProps) => ReactElement> = {
  "admin.dashboard": AdminTable,
  "admin.table": AdminTable,
  "admin.detail": AdminForm,
  "admin.form": AdminForm,
  "admin.settings": AdminSettings,
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

export function TemplateRenderer(props: TemplateRendererProps) {
  const [runtimeData, setRuntimeData] = useState<unknown>(props.data ?? props.page.data);
  const [status, setStatus] = useState<string | null>(null);
  const contributionId = props.runtime?.contributionId ?? props.page.id;
  const routeParams = props.runtime?.routeParams ?? {};
  const routeParamsKey = JSON.stringify(routeParams);

  useEffect(() => {
    let alive = true;
    if (!props.page.dataSources.length) {
      setRuntimeData(props.data ?? props.page.data);
      return () => { alive = false; };
    }
    setStatus("Loading data...");
    void Promise.all(props.page.dataSources.map(async (dataSource) => {
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
  }, [contributionId, props.data, props.page, props.runtime?.public, routeParamsKey]);

  const dispatchAction = async (action: ActionDefinition, input?: unknown) => {
    if (props.callbacks?.onAction && input === undefined) {
      await props.callbacks.onAction(action);
      return;
    }
    setStatus("Running action...");
    try {
      const result = props.runtime?.public
        ? await executePublicRuntimeAction(contributionId, action.id, input, routeParams, props.runtime.workspaceId)
        : await executeRuntimeAction(contributionId, action.id, input, routeParams);
      setStatus(result.status === "ok" ? "Action completed" : result.approvalId ? `Approval required: ${result.approvalId.slice(0, 8)}` : result.error ?? result.status);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Runtime action unavailable");
    }
  };

  const Template = registry[props.page.templateId];
  return <div className="template-runtime">
    {status ? <p className="message">{status}</p> : null}
    <Template {...props} data={runtimeData} callbacks={{
      ...props.callbacks,
      onAction: (action) => dispatchAction(action),
      onSubmit: (page, values) => {
        if (props.callbacks?.onSubmit) return props.callbacks.onSubmit(page, values);
        const action = page.actions.find((item) => item.intent === "submit") ?? page.actions[0];
        return action ? dispatchAction(action, values) : undefined;
      },
    }} />
  </div>;
}
