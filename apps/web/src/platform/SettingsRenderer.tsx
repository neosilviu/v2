import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  return field.type === "textarea" ? "textarea" : field.type === "password" ? "password" : field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "color" ? "color" : "text";
}

function defaultFieldValue(data: SectionPayload, field: FieldDefinition) {
  const source = data && !Array.isArray(data) && typeof data === "object" ? data as Record<string, unknown> : {};
  const value = source[field.id];
  if (field.type === "boolean") return value === true || value === "true";
  if (value === null || value === undefined) return field.type === "number" ? "" : "";
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
  return section.description ? <><strong>{section.title}</strong><p>{section.description}</p></> : <strong>{section.title}</strong>;
}

export function SettingsRenderer({ panel, shell, onShellChange }: { panel: SettingsPanelContribution; shell: Parameters<typeof RuntimeShellEditor>[0]["state"]; onShellChange: Parameters<typeof RuntimeShellEditor>[0]["onChange"] }) {
  const [loaded, setLoaded] = useState<Record<string, LoadedSection>>({});
  const [status, setStatus] = useState("Loading settings sections...");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sectionIds = useMemo(() => panel.sections.map((section) => section.dataSourceId).filter((value): value is string => Boolean(value)), [panel.sections]);
  const fallbackPage = panel.schema;

  useEffect(() => {
    let alive = true;
    if (!panel.sections.length) {
      setStatus("");
      return () => { alive = false; };
    }
    setStatus("Loading settings sections...");
    void Promise.all(panel.sections.map(async (section) => {
      if (!section.dataSourceId) return [section.id, { data: null, error: null }] as const;
      try {
        const result = await loadRuntimeData(panel.id, section.dataSourceId);
        if (result.status !== "ok") return [section.id, { data: null, error: result.error ?? result.status }] as const;
        return [section.id, { data: result.data, error: null }] as const;
      } catch (error) {
        return [section.id, { data: null, error: error instanceof Error ? error.message : "Settings data unavailable" }] as const;
      }
    })).then((entries) => {
      if (!alive) return;
      setLoaded(Object.fromEntries(entries));
      setStatus("Settings loaded");
    });
    return () => { alive = false; };
  }, [panel.id, refreshNonce, sectionIds.join("|")]);

  const refresh = () => setRefreshNonce((value) => value + 1);
  const heading = panel.id === "platform.settings.security" ? "Security administration" : panel.schema.title;

  const runAction = async (action: ActionDefinition, row?: Record<string, unknown> | null, values?: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const payload = { ...(row ?? {}), ...(values ?? {}) };
      const result = await executeRuntimeAction(panel.id, action.commandId, payload);
      if (result.status !== "ok") {
        setMessage(result.error ?? result.status);
        return false;
      }
      const effects = action.effects ?? [];
      if (!effects.length) {
        setMessage("Action completed");
        refresh();
        return true;
      }
      for (const effect of effects) {
        if (effect.type === "toast") setMessage(effect.message ?? "Action completed");
        if (effect.type === "refresh") refresh();
        if (effect.type === "closeDialog") setPendingAction(null);
        if (effect.type === "navigate") window.location.assign(effect.to);
      }
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
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
      setMessage("Reason is required.");
      return;
    }
    const action = pendingAction.action;
    const succeeded = await runAction(action, pendingAction.row, values);
    if (succeeded && !(action.effects ?? []).some((effect) => effect.type === "closeDialog")) setPendingAction(null);
  };

  if (!panel.sections.length) return <TemplateRenderer page={fallbackPage} runtime={{ contributionId: panel.id }} />;

  return <SurfaceCard className="settings-renderer">
    <div className="surface-header">
      <div><h2>{heading}</h2><p>{message ?? status ?? ""}</p></div>
      <div className="plugin-actions">
        <Button onClick={() => refresh()} disabled={submitting}>Refresh</Button>
      </div>
    </div>
    <div className="settings-grid">
      {panel.sections.map((section) => {
        const sectionData = loaded[section.id]?.data ?? null;
        const sectionError = loaded[section.id]?.error;
        if (section.id === "interface.builder") {
          return <section className="settings-subpanel" key={section.id}>
            <div className="surface-header"><div>{sectionTitle(section)}</div></div>
            {sectionError ? <p className="message">{sectionError}</p> : null}
            <ShellBuilder />
            {section.actions.length ? <div className="plugin-actions" style={{ marginTop: "0.75rem" }}>{section.actions.map((action) => <Button key={action.id} className={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : ""} onClick={() => action.confirmation ? setPendingAction({ section, action }) : void runAction(action, null, { layout: shell })}>{action.title}</Button>)}</div> : null}
          </section>;
        }
        if (section.kind === "crud" && section.crud) {
          return <section className="settings-subpanel" key={section.id}>
            <div className="surface-header"><div>{sectionTitle(section)}</div></div>
            {sectionError ? <p className="message">{sectionError}</p> : null}
            <CrudRenderer
              title={section.title}
              status={sectionError ?? undefined}
              rows={rowsFromData(sectionData)}
              columns={section.columns}
              fields={section.fields}
              crud={section.crud}
              onRefresh={refresh}
              onCreate={async (values) => { await runAction(section.crud!.createActionId ? { id: section.crud!.createActionId, title: "Create", commandId: section.crud!.createActionId } as ActionDefinition : section.actions[0]!, null, values); }}
              onUpdate={async (row, values) => { await runAction(section.crud!.updateActionId ? { id: section.crud!.updateActionId, title: "Save", commandId: section.crud!.updateActionId } as ActionDefinition : section.actions[0]!, row, values); }}
              onDelete={async (row) => { await runAction(section.crud!.deleteActionId ? { id: section.crud!.deleteActionId, title: "Delete", commandId: section.crud!.deleteActionId, variant: "danger" } as ActionDefinition : section.actions[0]!, row, {}); }}
              onRowAction={async (action, row) => { await runAction(action, row, {}); }}
            />
          </section>;
        }
        if (section.kind === "form") {
          const authMethods = section.id === "security.authentication" && sectionData && typeof sectionData === "object" && Array.isArray((sectionData as { methods?: unknown[] }).methods)
            ? (sectionData as { methods: Array<{ id?: string; title?: string; type?: string; status?: string; publicVisible?: boolean }> }).methods
            : [];
          return <section className="settings-subpanel" key={section.id}>
            <div className="surface-header">
              <div>{sectionTitle(section)}</div>
              {panel.sections.length > 1 ? <Badge>{section.fields.length} fields</Badge> : null}
            </div>
            {sectionError ? <p className="message">{sectionError}</p> : null}
            <form className="mail-form" onSubmit={(event) => { event.preventDefault(); const values = parseFormValues(section.fields, event.currentTarget); const action = section.actions.find((item) => item.intent === "submit") ?? section.actions[0]; if (!action) return; void runAction(action, null, values); }}>
              {section.fields.map((field) => {
                const defaultValue = defaultFieldValue(sectionData, field);
                if (field.type === "boolean") return <label className="template-check" key={field.id}><input name={field.id} type="checkbox" defaultChecked={Boolean(defaultValue)} disabled={field.readOnly || submitting} />{field.label}</label>;
                if (field.type === "select") return <label key={field.id}>{field.label}<select name={field.id} defaultValue={String(defaultValue)} disabled={field.readOnly || submitting} required={field.required}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
                return <label key={field.id}>{field.label}<input name={field.id} type={fieldType(field)} defaultValue={String(defaultValue)} disabled={field.readOnly || submitting} required={field.required} autoComplete={field.autocomplete} /></label>;
              })}
              <div className="plugin-actions">
                {section.actions.map((action) => <Button key={action.id} className={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : ""} type="submit" disabled={submitting}>{action.title}</Button>)}
              </div>
            </form>
            {authMethods.length ? <div className="settings-mini-list">{authMethods.map((method) => <div key={method.id ?? method.title} className="settings-mini-row"><strong>{method.title ?? method.id}</strong><span>{method.type ?? "method"}</span><Badge>{method.status ?? "unknown"}</Badge></div>)}</div> : null}
          </section>;
        }
        if (section.kind === "table" || section.kind === "summary" || section.kind === "actions") {
          const rows = rowsFromData(sectionData);
          return <section className="settings-subpanel" key={section.id}>
            <div className="surface-header">
              <div>{sectionTitle(section)}</div>
              {section.kind === "table" ? <Badge>{rows.length}</Badge> : null}
            </div>
            {sectionError ? <p className="message">{sectionError}</p> : null}
            {section.kind === "summary" ? <pre className="domain-instructions">{JSON.stringify(sectionData, null, 2)}</pre> : null}
            {section.kind === "table" ? <div className="template-table-wrap domain-table"><table>
              <thead><tr>{section.columns.map((column) => <th key={column.id}>{column.label}</th>)}<th /></tr></thead>
              <tbody>
                {rows.length ? rows.map((row, index) => <tr key={String(row.id ?? index)}>
                  {section.columns.map((column) => <td key={column.id}><strong>{valueAt(row, column.field)}</strong></td>)}
                  <td>
                    <div className="plugin-actions">
                      {section.rowActions.map((action) => <Button key={action.id} disabled={submitting} className={action.variant === "danger" ? "danger" : action.variant === "primary" ? "primary" : ""} onClick={() => action.confirmation ? setPendingAction({ section, action, row }) : void runAction(action, row, {})}>{action.title}</Button>)}
                    </div>
                  </td>
                </tr>) : <tr><td colSpan={section.columns.length + 1}>No records available.</td></tr>}
              </tbody>
            </table></div> : null}
            {section.actions.length && section.kind === "actions" ? <div className="plugin-actions">{section.actions.map((action) => <Button key={action.id} className={action.variant === "primary" ? "primary" : action.variant === "danger" ? "danger" : ""} onClick={() => action.confirmation ? setPendingAction({ section, action }) : void runAction(action)}>{action.title}</Button>)}</div> : null}
          </section>;
        }
        return null;
      })}
    </div>
    {pendingAction ? <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(7, 11, 17, 0.72)", display: "grid", placeItems: "center", padding: "1rem" }}>
      <SurfaceCard style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto" }}>
        <div className="surface-header">
          <div><small>{pendingAction.section.title}</small><h3>{pendingAction.action.confirmation?.title ?? pendingAction.action.title}</h3></div>
          <Button onClick={() => setPendingAction(null)} disabled={submitting}>Close</Button>
        </div>
        {pendingAction.action.confirmation?.message ? <p>{pendingAction.action.confirmation.message}</p> : null}
        <form className="mail-form" onSubmit={submitPendingAction}>
          {pendingAction.action.confirmation?.reasonRequired ? <label>Reason<textarea name="reason" required /></label> : null}
          {pendingAction.action.confirmation?.fields.filter((field) => !(pendingAction.action.confirmation?.reasonRequired && field.id === "reason")).map((field) => field.type === "boolean" ? <label className="template-check" key={field.id}><input name={field.id} type="checkbox" defaultChecked={false} disabled={submitting} />{field.label}</label> : field.type === "select" ? <label key={field.id}>{field.label}<select name={field.id} defaultValue={field.options[0]?.value ?? ""} disabled={submitting} required={field.required}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : field.type === "textarea" ? <label key={field.id}>{field.label}<textarea name={field.id} required={field.required} disabled={submitting} /></label> : <label key={field.id}>{field.label}<input name={field.id} type={fieldType(field)} required={field.required} disabled={submitting} /></label>)}
          <div className="plugin-actions">
            <Button onClick={() => setPendingAction(null)} disabled={submitting} type="button">Cancel</Button>
            <Button className="primary" type="submit" disabled={submitting}>Confirm</Button>
          </div>
        </form>
      </SurfaceCard>
    </div> : null}
  </SurfaceCard>;
}
