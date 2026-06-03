import { useMemo, useState, type FormEvent } from "react";
import type {
  ActionDefinition,
  ColumnDefinition,
  CrudDefinition,
  FieldDefinition,
} from "@v2/ui-schema";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";

type CrudRow = Record<string, unknown>;

type CrudRendererProps = {
  title: string;
  description?: string;
  status: string | undefined;
  busy?: boolean;
  compactHeader?: boolean;
  rows: CrudRow[];
  columns: ColumnDefinition[];
  fields: FieldDefinition[];
  crud: CrudDefinition;
  rowActions?: ActionDefinition[];
  onRefresh?: () => void;
  onCreate: (values: Record<string, unknown>) => Promise<boolean>;
  onUpdate: (row: CrudRow, values: Record<string, unknown>) => Promise<boolean>;
  onDelete: (row: CrudRow) => Promise<boolean>;
  onRowAction?: (action: ActionDefinition, row: CrudRow) => Promise<boolean>;
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
  if (typeof firstStringField === "string" && firstStringField)
    return firstStringField;
  return String(valueAt(row, crud.rowIdField));
}

function actionIcon(label: string) {
  const key = label.toLowerCase();
  if (key.includes("reload") || key.includes("refresh")) return "↻";
  if (key.includes("add") || key.includes("create")) return "+";
  if (key.includes("edit") || key.includes("save")) return "✎";
  if (
    key.includes("remove") ||
    key.includes("delete") ||
    key.includes("uninstall")
  )
    return "×";
  if (
    key.includes("disable") ||
    key.includes("deactivate") ||
    key.includes("deny")
  )
    return "○";
  if (
    key.includes("activate") ||
    key.includes("enable") ||
    key.includes("approve")
  )
    return "✓";
  if (key.includes("view")) return "◎";
  if (key.includes("impersonate")) return "⇄";
  return "•";
}

function actionClass(variant?: string) {
  return [
    variant === "danger" ? "danger" : variant === "primary" ? "primary" : "",
    "settings-icon-button",
  ]
    .filter(Boolean)
    .join(" ");
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
      output[field.id] =
        value === null || value === undefined || value === ""
          ? ""
          : Number(value);
      continue;
    }
    output[field.id] = value ?? "";
  }
  return output;
}

function fieldDefaultValue(row: CrudRow | null, field: FieldDefinition) {
  const value = row ? row[field.id] : undefined;
  if (field.type === "boolean") return value === true || value === "true";
  if (value === null || value === undefined) return "";
  return String(value);
}

export function CrudRenderer({
  title,
  description,
  status,
  busy,
  compactHeader,
  rows,
  columns,
  fields,
  crud,
  rowActions = [],
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  onRowAction,
}: CrudRendererProps) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const actions = rowActions.length ? rowActions : crud.rowActions;

  const dialogTitle = useMemo(() => {
    if (!dialog) return "";
    if (dialog.mode === "create") return `Add ${crud.entityLabel}`;
    if (dialog.mode === "edit") return `Edit ${crud.entityLabel}`;
    return `Remove ${crud.entityLabel}`;
  }, [crud.entityLabel, dialog]);

  const openDialog = (next: DialogState) => {
    setMessage(null);
    setDialog(next);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || dialog.mode === "delete") return;
    setSubmitting(true);
    setMessage(null);
    try {
      const values = normalizeInput(fields, event.currentTarget);
      const saved =
        dialog.mode === "create"
          ? await onCreate(values)
          : await onUpdate(dialog.row, values);
      if (saved) setDialog(null);
      else
        setMessage(
          "Changes were not saved. Review the error shown above and try again.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Changes could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!dialog || dialog.mode !== "delete") return;
    setSubmitting(true);
    setMessage(null);
    try {
      const deleted = await onDelete(dialog.row);
      if (deleted) setDialog(null);
      else
        setMessage(
          "This item was not removed. Review the error shown above and try again.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This item could not be removed.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SurfaceCard className="settings-list-card">
      {compactHeader ? null : (
        <div className="surface-header">
          <div>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
            {status ? <p className="settings-inline-error">{status}</p> : null}
          </div>
          <div className="plugin-actions">
            <Badge>{rows.length}</Badge>
            {onRefresh ? (
              <Button
                aria-label="Reload"
                className="settings-icon-button"
                onClick={() => onRefresh()}
                disabled={busy || submitting}
                title="Reload"
              >
                ↻
              </Button>
            ) : null}
            <Button
              aria-label={`Add ${crud.entityLabel}`}
              className="primary settings-icon-button"
              onClick={() => openDialog({ mode: "create", row: null })}
              disabled={busy || submitting}
              title={`Add ${crud.entityLabel}`}
            >
              +
            </Button>
          </div>
        </div>
      )}
      {compactHeader ? (
        <div className="settings-crud-toolbar">
          {status ? <p className="settings-inline-error">{status}</p> : null}
          <div className="plugin-actions">
            <Badge>{rows.length}</Badge>
            {onRefresh ? (
              <Button
                aria-label="Reload"
                className="settings-icon-button"
                onClick={() => onRefresh()}
                disabled={busy || submitting}
                title="Reload"
              >
                ↻
              </Button>
            ) : null}
            <Button
              aria-label={`Add ${crud.entityLabel}`}
              className="primary settings-icon-button"
              onClick={() => openDialog({ mode: "create", row: null })}
              disabled={busy || submitting}
              title={`Add ${crud.entityLabel}`}
            >
              +
            </Button>
          </div>
        </div>
      ) : null}
      <div className="template-table-wrap domain-table">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.id}>{column.label}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={String(valueAt(row, crud.rowIdField))}>
                  {columns.map((column) => (
                    <td key={column.id}>
                      {column.type === "badge" ? (
                        <Badge>{String(valueAt(row, column.field))}</Badge>
                      ) : (
                        <span>{String(valueAt(row, column.field))}</span>
                      )}
                    </td>
                  ))}
                  <td>
                    <div className="plugin-actions">
                      <Button
                        aria-label="Edit"
                        className="settings-icon-button"
                        disabled={busy || submitting}
                        onClick={() => openDialog({ mode: "edit", row })}
                        title="Edit"
                      >
                        ✎
                      </Button>
                      <Button
                        aria-label="Remove"
                        className="danger settings-icon-button"
                        disabled={busy || submitting}
                        onClick={() => openDialog({ mode: "delete", row })}
                        title="Remove"
                      >
                        ×
                      </Button>
                      {onRowAction
                        ? actions.map((action) => (
                            <Button
                              key={action.id}
                              aria-label={action.title}
                              className={actionClass(action.variant)}
                              disabled={busy || submitting}
                              onClick={() => void onRowAction(action, row)}
                              title={action.title}
                            >
                              {actionIcon(action.title)}
                            </Button>
                          ))
                        : null}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length + 1}>
                  {crud.listEmptyMessage ??
                    `No ${crud.entityLabelPlural.toLowerCase()} found.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {dialog ? (
        <div className="settings-dialog-backdrop">
          <SurfaceCard className="settings-dialog">
            <div className="surface-header">
              <div>
                <small>{crud.entityLabel}</small>
                <h3>{dialogTitle}</h3>
              </div>
              <Button
                aria-label="Close"
                className="settings-icon-button"
                onClick={() => setDialog(null)}
                disabled={submitting}
                title="Close"
              >
                ×
              </Button>
            </div>
            {message ? (
              <p className="settings-inline-error" role="alert">
                {message}
              </p>
            ) : null}
            {dialog.mode === "delete" ? (
              <div>
                <p>
                  Remove <strong>{rowTitle(dialog.row, crud)}</strong>? This
                  action cannot be undone.
                </p>
                <div className="plugin-actions settings-dialog-actions">
                  <Button
                    aria-label="Cancel"
                    className="settings-icon-button"
                    onClick={() => setDialog(null)}
                    disabled={submitting}
                    title="Cancel"
                  >
                    ×
                  </Button>
                  <Button
                    aria-label="Remove"
                    className="danger settings-icon-button"
                    onClick={() => void confirmDelete()}
                    disabled={submitting}
                    title="Remove"
                  >
                    ×
                  </Button>
                </div>
              </div>
            ) : (
              <form
                className="mail-form"
                onSubmit={submit}
                key={`${dialog.mode}:${dialog.mode === "edit" ? String(dialog.row[crud.rowIdField]) : "new"}`}
              >
                {fields.map((field) => {
                  const defaultValue = fieldDefaultValue(dialog.row, field);
                  if (field.type === "boolean") {
                    return (
                      <label className="template-check" key={field.id}>
                        <input
                          name={field.id}
                          type="checkbox"
                          defaultChecked={Boolean(defaultValue)}
                          disabled={field.readOnly || submitting}
                        />
                        {field.label}
                      </label>
                    );
                  }
                  if (field.type === "select") {
                    return (
                      <label key={field.id}>
                        {field.label}
                        <select
                          name={field.id}
                          defaultValue={String(defaultValue)}
                          disabled={field.readOnly || submitting}
                          required={field.required}
                        >
                          {field.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  }
                  if (field.type === "textarea") {
                    return (
                      <label key={field.id}>
                        {field.label}
                        <textarea
                          name={field.id}
                          defaultValue={String(defaultValue)}
                          disabled={field.readOnly || submitting}
                          required={field.required}
                        />
                      </label>
                    );
                  }
                  return (
                    <label key={field.id}>
                      {field.label}
                      <input
                        name={field.id}
                        type={
                          field.type === "number"
                            ? "number"
                            : field.type === "email"
                              ? "email"
                              : field.type === "password"
                                ? "password"
                                : field.type === "date"
                                  ? "date"
                                  : field.type === "color"
                                    ? "color"
                                    : "text"
                        }
                        defaultValue={String(defaultValue)}
                        disabled={field.readOnly || submitting}
                        required={field.required}
                        autoComplete={field.autocomplete}
                      />
                    </label>
                  );
                })}
                <div className="plugin-actions settings-dialog-actions">
                  <Button
                    aria-label="Cancel"
                    className="settings-icon-button"
                    onClick={() => setDialog(null)}
                    disabled={submitting}
                    title="Cancel"
                    type="button"
                  >
                    ×
                  </Button>
                  <Button
                    aria-label={
                      dialog.mode === "create" ? "Add" : "Save changes"
                    }
                    className="primary settings-icon-button"
                    type="submit"
                    disabled={submitting}
                    title={dialog.mode === "create" ? "Add" : "Save changes"}
                  >
                    {dialog.mode === "create" ? "+" : "✓"}
                  </Button>
                </div>
              </form>
            )}
          </SurfaceCard>
        </div>
      ) : null}
    </SurfaceCard>
  );
}
