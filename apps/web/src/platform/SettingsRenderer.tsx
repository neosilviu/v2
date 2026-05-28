import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Notification } from "@v2/rpc-contracts";
import type { ActionDefinition, ColumnDefinition, FieldDefinition, SettingsPanelContribution, SettingsSection } from "@v2/ui-schema";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { executeRuntimeAction, loadRuntimeData } from "../api";
import { CrudRenderer } from "./CrudRenderer";
import { TemplateRenderer } from "./TemplateRenderer";
import { RuntimeShellEditor } from "./RuntimeShellEditor";
import { ShellBuilder } from "./ShellBuilder";

type SectionPayload = Record<string, unknown> | { rows?: unknown[] } | unknown[] | null;
type LoadedSection = { data: SectionPayload; error: string | null };
type PendingAction = { section: SettingsSection; action: ActionDefinition; row?: Record<string, unknown> | null };
type SettingsRendererProps = {
  panel: SettingsPanelContribution;
  shell: Parameters<typeof RuntimeShellEditor>[0]["state"];
  onShellChange: Parameters<typeof RuntimeShellEditor>[0]["onChange"];
  emit?: (item: Notification) => void;
};

function createNotification(level: Notification["level"], title: string, message: string): Notification {
  return { id: crypto.randomUUID(), level, title, message, source: "settings", dismissible: true, createdAt: new Date().toISOString() };
}

function rowsFromData(data: SectionPayload): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.map((row) => (row && typeof row === "object" ? row as Record<string, unknown> : {}));
  if (data && typeof data === "object" && Array.isArray((data as { rows?: unknown[] }).rows)) {
    return (data as { rows: unknown[] }).rows.map((row) => (row && typeof row === "object" ? row as Record<string, unknown> : {}));
  }
  return [];
}

function valueAt(row: Record<string, unknown> | null | undefined, field: string) {
  const value = row?.[field];
  return value === null || value === undefined ? "" : String(value);
}

function fieldType(field: FieldDefinition) {
  return field.type === "password" ? "password" : field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "color" ? "color" : "text";
}

function defaultFieldValue(data: SectionPayload, field: FieldDefinition) {
  const source = data && !Array.isArray(data) && typeof data === "object" ? data as Record<string, unknown> : {};
  const value = source[field.id];
  if (field.type === "boolean") return value === true || value === "true";
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseFormValues(fields: FieldDefinition[], form: HTMLFormElement) {
  const values = new FormData(form);
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "boolean") {
      output[field.id] = values.get(field.id) === "on";
      continue;
    }
    const value = values.get(field.id);
    if (field.type === "number") {
      output[field.id] = value === null || value === undefined || value === "" ? "" : Number(value);
      continue;
    }
    output[field.id] = value ?? "";
  }
  return output;
}

function sectionTitle(section: SettingsSection) {
  return section.description ? <><h3>{section.title}</h3><p>{section.description}</p></> : <h3>{section.title}</h3>;
}

function actionDefinition(commandId: string, title: string, variant: "default" | "primary" | "danger" = "default"): ActionDefinition {
  return { id: commandId, title, commandId, intent: "execute", variant, access: "private", risk: "safe", placement: "form", effects: [] };
}

export function SettingsRenderer({ panel, shell, onShellChange, emit }: SettingsRendererProps) {
  const [loaded, setLoaded] = useState<Record<string, LoadedSection>>({});
  const [status, setStatus] = useState("Loading saved configuration...");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageLevel, setMessageLevel] = useState<"success" | "error" | "info">("info");

  const sectionIds = useMemo(() => panel.sections.map((section) => section.dataSourceId).filter((value): value is string => Boolean(value)), [panel.sections]);
  const fallbackPage = panel.schema;

  useEffect(() => {
    let alive = true;
    if (!panel.sections.length) {
      setStatus("");
      return () => { alive = false; };
    }
    setStatus("Loading saved configuration...");
    void Promise.all(panel.sections.map(async (section) => {
      if (!section.dataSourceId) return [section.id, { data: null, error: null }] as const;
      try {
        const result = await loadRuntimeData(panel.id, section.dataSourceId);
        if (result.status !== "ok") return [section.id, { data: null, error: result.error ?? "Configuration could not be loaded." }] as const;
        return [section.id, { data: result.data, error: null }] as const;
      } catch (error) {
        return [section.id, { data: null, error: error instanceof Error ? error.message : "Configuration could not be loaded." }] as const;
      }
    })).then((entries) => {
      if (!alive) return;
      setLoaded(Object.fromEntries(entries));
      setStatus("Saved configuration loaded");
    });
    return () => { alive = false; };
  }, [panel.id, refreshNonce, sectionIds.join("|")]);

  const refresh = () => setRefreshNonce((value) => value + 1);
  const showFeedback = (level: "success" | "error" | "info", text: string) => {
    setMessageLevel(level);
    setMessage(text);
    if (emit && level !== "info") emit(createNotification(level, level === "success" ? "Changes saved" : "Action failed", text));
  };

  const runAction = async (action: ActionDefinition, row?: Record<string, unknown> | null, values?: Record<string, unknown>) => {
    setSubmitting(true);
    setMessage(null);
    try {
      const payload = { ...(row ?? {}), ...(values ?? {}) };
      const result = await executeRuntimeAction(panel.id, action.commandId, payload);
      if (result.status !== "ok") {
        showFeedback("error", result.error ?? "Changes could not be saved.");
        return false;
      }
      const toastEffect = action.effects.find((effect) => effect.type === "toast");
      showFeedback("success", toastEffect?.type === "toast" && toastEffect.message ? toastEffect.message : "Changes saved successfully.");
      refresh();
      for (const effect of action.effects) {
        if (effect.type === "closeDialog") setPendingAction(null);
        if (effect.type === "navigate") window.location.assign(effect.to);
      }
      return true;
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "Changes could not be saved.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const submitPendingAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingAction) return;
    const values = parseFormValues(pendingAction.action.confirmation?.fields ?? [], event.currentTarget);
    if (pendingAction.action.confirmation?.reasonRequired && !String(values.reason ?? "").trim()) {
      showFeedback("error", "A reason is required before continuing.");
      return;
    }
    const succeeded = await runAction(pendingAction.action, pendingAction.row, values);
    if (succeeded && !pendingAction.action.effects.some((effect) => effect.type === "closeDialog")) setPendingAction(null);
  };

  if (!panel.sections.length) return <TemplateRenderer page={fallbackPage} runtime={{ contributionId: panel.id }} />;

  return <div className="settings-renderer">
    <div className="settings-panel-toolbar">
      <div>
        <p>{status}</p>
        {message ? <div className={`settings-feedback ${messageLevel}`} role={messageLevel === "error" ? "alert" : "status"}>{message}</div> : null}
      </div>
      <Button onClick={() => refresh()} disabled={submitting}>Reload values</Button>
    </div>
    <div className="settings-grid">
      {panel.sections.map((section) => {
        const sectionData = loaded[section.id]?.data ?? null;
        const sectionError = loaded[section.id]?.error;
        if (section.id === "interface.builder") {
          return <section className="settings-subpanel" key={section.id}>
            <div className="surface-header"><div>{sectionTitle(section)}</div></div>
            {sectionError ? <p className="settings-inline-error">{sectionError}</p> : null}
            <ShellBuilder />
            {section.actions.length ? <div className="plugin-actions settings-section-actions">{section.actions.map((action) => <Button key={action.id} className={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : ""} disabled={submitting} onClick={() => action.confirmation ? setPendingAction({ section, action }) : void runAction(action, null, { layout: shell })}>{submitting ? "Saving..." : action.title}</Button>)}</div> : null}
          </section>;
        }
        if (section.kind === "crud" && section.crud) {
          return <CrudRenderer
            key={section.id}
            title={section.title}
            description={section.description}
            status={sectionError ?? undefined}
            busy={submitting}
            rows={rowsFromData(sectionData)}
            columns={section.columns}
            fields={section.fields}
            crud={section.crud}
            onRefresh={refresh}
            onCreate={(values) => runAction(actionDefinition(section.crud!.createActionId, "Add", "primary"), null, values)}
            onUpdate={(row, values) => runAction(actionDefinition(section.crud!.updateActionId, "Save", "primary"), row, values)}
            onDelete={(row) => runAction(actionDefinition(section.crud!.deleteActionId, "Remove", "danger"), row, {})}
            onRowAction={(action, row) => runAction(action, row, {})}
          />;
        }
        if (section.kind === "form") {
          const authMethods = section.id === "security.authentication" && sectionData && typeof sectionData === "object" && Array.isArray((sectionData as { methods?: unknown[] }).methods)
            ? (sectionData as { methods: Array<{ id?: string; title?: string; type?: string; status?: string }> }).methods
            : [];
          return <SurfaceCard className="settings-subpanel" key={section.id}>
            <div className="surface-header"><div>{sectionTitle(section)}</div>{panel.sections.length > 1 ? <Badge>{section.fields.length} fields</Badge> : null}</div>
            {sectionError ? <p className="settings-inline-error">{sectionError}</p> : null}
            <form className="mail-form" key={`${section.id}:${refreshNonce}`} onSubmit={(event) => {
              event.preventDefault();
              const values = parseFormValues(section.fields, event.currentTarget);
              const action = section.actions.find((item) => item.intent === "submit") ?? section.actions[0];
              if (action) void runAction(action, null, values);
            }}>
              {section.fields.map((field) => {
                const defaultValue = defaultFieldValue(sectionData, field);
                if (field.type === "boolean") return <label className="template-check" key={field.id}><input name={field.id} type="checkbox" defaultChecked={Boolean(defaultValue)} disabled={field.readOnly || submitting} />{field.label}</label>;
                if (field.type === "select") return <label key={field.id}>{field.label}<select name={field.id} defaultValue={String(defaultValue)} disabled={field.readOnly || submitting} required={field.required}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
                if (field.type === "textarea") return <label key={field.id}>{field.label}<textarea name={field.id} defaultValue={String(defaultValue)} disabled={field.readOnly || submitting} required={field.required} /></label>;
                return <label key={field.id}>{field.label}<input name={field.id} type={fieldType(field)} defaultValue={String(defaultValue)} disabled={field.readOnly || submitting} required={field.required} autoComplete={field.autocomplete} /></label>;
              })}
              <div className="plugin-actions settings-section-actions">
                {section.actions.map((action) => <Button key={action.id} className={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : ""} type="submit" disabled={submitting}>{submitting ? "Saving..." : action.title}</Button>)}
              </div>
            </form>
            {authMethods.length ? <div className="settings-mini-list">{authMethods.map((method) => <div key={method.id ?? method.title} className="settings-mini-row"><strong>{method.title ?? method.id}</strong><span>{method.type ?? "method"}</span><Badge>{method.status ?? "unknown"}</Badge></div>)}</div> : null}
          </SurfaceCard>;
        }
        if (section.kind === "table" || section.kind === "summary" || section.kind === "actions") {
          const rows = rowsFromData(sectionData);
          return <SurfaceCard className="settings-subpanel" key={section.id}>
            <div className="surface-header"><div>{sectionTitle(section)}</div>{section.kind === "table" ? <Badge>{rows.length}</Badge> : null}</div>
            {sectionError ? <p className="settings-inline-error">{sectionError}</p> : null}
            {section.kind === "table" ? <div className="template-table-wrap domain-table"><table>
              <thead><tr>{section.columns.map((column) => <th key={column.id}>{column.label}</th>)}{section.rowActions.length ? <th>Actions</th> : null}</tr></thead>
              <tbody>{rows.length ? rows.map((row, index) => <tr key={String(row.id ?? index)}>
                {section.columns.map((column: ColumnDefinition) => <td key={column.id}>{column.type === "badge" ? <Badge>{valueAt(row, column.field)}</Badge> : <span>{valueAt(row, column.field)}</span>}</td>)}
                {section.rowActions.length ? <td><div className="plugin-actions">{section.rowActions.map((action) => <Button key={action.id} disabled={submitting} className={action.variant === "danger" ? "danger" : action.variant === "primary" ? "primary" : ""} onClick={() => action.confirmation ? setPendingAction({ section, action, row }) : void runAction(action, row, {})}>{action.title}</Button>)}</div></td> : null}
              </tr>) : <tr><td colSpan={section.columns.length + (section.rowActions.length ? 1 : 0)}>No records found.</td></tr>}</tbody>
            </table></div> : null}
            {section.kind === "actions" ? <div className="plugin-actions settings-section-actions">{section.actions.map((action) => <Button key={action.id} disabled={submitting} className={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : ""} onClick={() => action.confirmation ? setPendingAction({ section, action }) : void runAction(action)}>{action.title}</Button>)}</div> : null}
          </SurfaceCard>;
        }
        return null;
      })}
    </div>
    {pendingAction ? <div className="settings-dialog-backdrop">
      <SurfaceCard className="settings-dialog">
        <div className="surface-header"><div><small>{pendingAction.section.title}</small><h3>{pendingAction.action.confirmation?.title ?? pendingAction.action.title}</h3></div><Button onClick={() => setPendingAction(null)} disabled={submitting}>Close</Button></div>
        {pendingAction.action.confirmation?.message ? <p>{pendingAction.action.confirmation.message}</p> : null}
        <form className="mail-form" onSubmit={submitPendingAction}>
          {pendingAction.action.confirmation?.reasonRequired ? <label>Reason<textarea name="reason" required disabled={submitting} /></label> : null}
          {pendingAction.action.confirmation?.fields.filter((field) => !(pendingAction.action.confirmation?.reasonRequired && field.id === "reason")).map((field) => field.type === "boolean" ? <label className="template-check" key={field.id}><input name={field.id} type="checkbox" disabled={submitting} />{field.label}</label> : field.type === "select" ? <label key={field.id}>{field.label}<select name={field.id} defaultValue={field.options[0]?.value ?? ""} disabled={submitting} required={field.required}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : field.type === "textarea" ? <label key={field.id}>{field.label}<textarea name={field.id} required={field.required} disabled={submitting} /></label> : <label key={field.id}>{field.label}<input name={field.id} type={fieldType(field)} required={field.required} disabled={submitting} /></label>)}
          <div className="plugin-actions settings-dialog-actions"><Button onClick={() => setPendingAction(null)} disabled={submitting} type="button">Cancel</Button><Button className="primary" type="submit" disabled={submitting}>{submitting ? "Working..." : "Confirm"}</Button></div>
        </form>
      </SurfaceCard>
    </div> : null}
  </div>;
}
