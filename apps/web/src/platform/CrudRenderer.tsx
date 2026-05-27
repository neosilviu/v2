import { useMemo, useState, type FormEvent } from "react";
import type { ActionDefinition, ColumnDefinition, CrudDefinition, FieldDefinition } from "@v2/ui-schema";
import { Button, SurfaceCard } from "@v2/ui-kit";

type CrudRow = Record<string, unknown>;

type CrudRendererProps = {
  title: string;
  status: string | undefined;
  busy?: boolean;
  rows: CrudRow[];
  columns: ColumnDefinition[];
  fields: FieldDefinition[];
  crud: CrudDefinition;
  onRefresh?: () => void;
  onCreate: (values: Record<string, unknown>) => Promise<void>;
  onUpdate: (row: CrudRow, values: Record<string, unknown>) => Promise<void>;
  onDelete: (row: CrudRow) => Promise<void>;
  onRowAction?: (action: ActionDefinition, row: CrudRow) => Promise<void>;
};

type DialogState =
  | { mode: "create"; row: null }
  | { mode: "edit"; row: CrudRow }
  | { mode: "delete"; row: CrudRow };

function valueAt(row: CrudRow, field: string) {
  const value = row[field];
  return value === null || value === undefined ? "" : value;
}

function rowTitle(row: CrudRow, crud: CrudDefinition) {
  if (crud.rowTitleField) return String(valueAt(row, crud.rowTitleField));
  const firstStringField = row[crud.rowIdField];
  if (typeof firstStringField === "string" && firstStringField) return firstStringField;
  return String(valueAt(row, crud.rowIdField));
}

function normalizeInput(fields: FieldDefinition[], form: HTMLFormElement) {
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

function fieldDefaultValue(row: CrudRow | null, field: FieldDefinition) {
  const value = row ? row[field.id] : undefined;
  if (field.type === "boolean") return value === true || value === "true";
  if (value === null || value === undefined) return field.type === "number" ? "" : "";
  return String(value);
}

export function CrudRenderer({ title, status, busy, rows, columns, fields, crud, onRefresh, onCreate, onUpdate, onDelete, onRowAction }: CrudRendererProps) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const dialogTitle = useMemo(() => {
    if (!dialog) return "";
    if (dialog.mode === "create") return `Create ${crud.entityLabel}`;
    if (dialog.mode === "edit") return `Edit ${crud.entityLabel}`;
    return `Delete ${crud.entityLabel}`;
  }, [crud.entityLabel, dialog]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || dialog.mode === "delete") return;
    setSubmitting(true);
    try {
      const values = normalizeInput(fields, event.currentTarget);
      if (dialog.mode === "create") await onCreate(values);
      else await onUpdate(dialog.row, values);
      setDialog(null);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!dialog || dialog.mode !== "delete") return;
    setSubmitting(true);
    try {
      await onDelete(dialog.row);
      setDialog(null);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return <SurfaceCard>
    <div className="surface-header">
      <div><small>generic crud</small><h3>{title}</h3><p>{status ?? message ?? ""}</p></div>
      <div className="plugin-actions">
        {onRefresh ? <Button onClick={() => void onRefresh()} disabled={busy || submitting}>Refresh</Button> : null}
        <Button className="primary" onClick={() => setDialog({ mode: "create", row: null })} disabled={busy || submitting}>Add {crud.entityLabel}</Button>
      </div>
    </div>
    <div className="template-table-wrap domain-table">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column.id}>{column.label}</th>)}<th /></tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => <tr key={String(valueAt(row, crud.rowIdField))}>
            {columns.map((column) => <td key={column.id}><strong>{String(valueAt(row, column.field))}</strong>{column.type === "badge" ? <small>{String(valueAt(row, column.field))}</small> : null}</td>)}
            <td>
              <div className="plugin-actions">
                <Button disabled={busy || submitting} onClick={() => setDialog({ mode: "edit", row })}>Edit</Button>
                <Button disabled={busy || submitting} onClick={() => setDialog({ mode: "delete", row })}>Delete</Button>
                {onRowAction ? crud.rowActions.map((action) => <Button key={action.id} className={action.variant === "danger" ? "danger" : action.variant === "primary" ? "primary" : ""} disabled={busy || submitting} onClick={() => void onRowAction(action, row)}>{action.title}</Button>) : null}
              </div>
            </td>
          </tr>) : <tr><td colSpan={columns.length + 1}>{crud.listEmptyMessage ?? `No ${crud.entityLabelPlural.toLowerCase()} available.`}</td></tr>}
        </tbody>
      </table>
    </div>
    {dialog ? <div style={{ position: "fixed", inset: 0, background: "rgba(7, 11, 17, 0.72)", display: "grid", placeItems: "center", zIndex: 60, padding: "1rem" }}>
      <SurfaceCard style={{ width: "min(960px, 100%)", maxHeight: "90vh", overflow: "auto" }}>
        <div className="surface-header">
          <div><small>{crud.entityLabel}</small><h3>{dialogTitle}</h3></div>
          <Button onClick={() => setDialog(null)} disabled={submitting}>Close</Button>
        </div>
        {message ? <p className="message">{message}</p> : null}
        {dialog.mode === "delete" ? <div>
          <p>Delete <strong>{rowTitle(dialog.row, crud)}</strong>?</p>
          <div className="plugin-actions">
            <Button onClick={() => setDialog(null)} disabled={submitting}>Cancel</Button>
            <Button className="primary" onClick={() => void confirmDelete()} disabled={submitting}>Delete</Button>
          </div>
        </div> : <form className="mail-form" onSubmit={submit}>
          {fields.map((field) => {
            const defaultValue = fieldDefaultValue(dialog.row, field);
            if (field.type === "boolean") {
              return <label className="template-check" key={field.id}><input name={field.id} type="checkbox" defaultChecked={Boolean(defaultValue)} disabled={field.readOnly || submitting} />{field.label}</label>;
            }
            if (field.type === "select") {
              return <label key={field.id}>{field.label}<select name={field.id} defaultValue={String(defaultValue)} disabled={field.readOnly || submitting} required={field.required}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
            }
            return <label key={field.id}>{field.label}<input name={field.id} type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "password" ? "password" : field.type === "date" ? "date" : field.type === "color" ? "color" : "text"} defaultValue={String(defaultValue)} disabled={field.readOnly || submitting} required={field.required} autoComplete={field.autocomplete} /></label>;
          })}
          <div className="plugin-actions">
            <Button onClick={() => setDialog(null)} disabled={submitting} type="button">Cancel</Button>
            <Button className="primary" type="submit" disabled={submitting}>{dialog.mode === "create" ? "Create" : "Save"}</Button>
          </div>
        </form>}
      </SurfaceCard>
    </div> : null}
  </SurfaceCard>;
}
