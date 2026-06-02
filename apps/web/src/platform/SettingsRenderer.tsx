import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Notification } from "@v2/rpc-contracts";
import type {
  ActionDefinition,
  ColumnDefinition,
  FieldDefinition,
  SettingsPanelContribution,
  SettingsSection,
} from "@v2/ui-schema";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { executeRuntimeAction, loadRuntimeData, uploadPlugin } from "../api";
import { createSettingsNotification } from "./settings-ui";
import { CrudRenderer } from "./CrudRenderer";
import { TemplateRenderer } from "./TemplateRenderer";
import { RuntimeShellEditor } from "./RuntimeShellEditor";
import { ShellBuilder } from "./ShellBuilder";

type SectionPayload =
  | Record<string, unknown>
  | { rows?: unknown[] }
  | unknown[]
  | null;
type LoadedSection = { data: SectionPayload; error: string | null };
type PendingAction = {
  section: SettingsSection;
  action: ActionDefinition;
  row?: Record<string, unknown> | null;
};
type SettingsRendererProps = {
  panel: SettingsPanelContribution;
  shell: Parameters<typeof RuntimeShellEditor>[0]["state"];
  onShellChange: Parameters<typeof RuntimeShellEditor>[0]["onChange"];
  emit?: (item: Notification) => void;
};

function rowsFromData(data: SectionPayload): Record<string, unknown>[] {
  if (Array.isArray(data))
    return data.map((row) =>
      row && typeof row === "object" ? (row as Record<string, unknown>) : {},
    );
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { rows?: unknown[] }).rows)
  ) {
    return (data as { rows: unknown[] }).rows.map((row) =>
      row && typeof row === "object" ? (row as Record<string, unknown>) : {},
    );
  }
  return [];
}

function valueAt(
  row: Record<string, unknown> | null | undefined,
  field: string,
) {
  const value = row?.[field];
  return value === null || value === undefined ? "" : String(value);
}

function rawValueAt(
  row: Record<string, unknown> | null | undefined,
  field: string,
) {
  return row?.[field];
}

function humanizeKey(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function summarizeRecord(record: Record<string, unknown>) {
  const direct =
    record.email ??
    record.name ??
    record.label ??
    record.title ??
    record.systemKey ??
    record.permission ??
    record.id;
  if (direct !== null && direct !== undefined && direct !== "") {
    const effect = typeof record.effect === "string" && record.effect ? ` (${record.effect})` : "";
    return `${String(direct)}${effect}`;
  }
  const pairs = Object.entries(record)
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean"))
    .slice(0, 3)
    .map(([key, value]) => `${humanizeKey(key)}: ${typeof value === "boolean" ? value ? "Yes" : "No" : String(value)}`);
  return pairs.join(", ");
}

function formatCellValue(
  value: unknown,
  type: ColumnDefinition["type"] = "text",
) {
  if (value === null || value === undefined || value === "")
    return type === "badge" ? "Not set" : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (type === "date") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    }
    return type === "badge" || type === "status" ? humanizeKey(value) : value;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => {
        if (typeof item === "string" || typeof item === "number")
          return String(item);
        if (item && typeof item === "object")
          return summarizeRecord(item as Record<string, unknown>);
        return "";
      })
      .filter(Boolean);
    if (!items.length) return "";
    return `${items.slice(0, 4).join(", ")}${items.length > 4 ? `, +${items.length - 4} more` : ""}`;
  }
  if (typeof value === "object") {
    return summarizeRecord(value as Record<string, unknown>);
  }
  return String(value);
}

function renderTableCell(
  row: Record<string, unknown>,
  column: ColumnDefinition,
) {
  const value = formatCellValue(rawValueAt(row, column.field), column.type);
  if (column.type === "badge" || column.type === "status")
    return <Badge>{value}</Badge>;
  return <span>{value}</span>;
}

function rowSearchText(row: Record<string, unknown>, columns: ColumnDefinition[]) {
  return columns
    .map((column) => formatCellValue(rawValueAt(row, column.field), column.type))
    .join(" ")
    .toLowerCase();
}

function fieldType(field: FieldDefinition) {
  return field.type === "password"
    ? "password"
    : field.type === "email"
      ? "email"
      : field.type === "number"
        ? "number"
        : field.type === "date"
          ? "date"
          : field.type === "color"
            ? "color"
            : "text";
}

function defaultFieldValue(data: SectionPayload, field: FieldDefinition) {
  const source =
    data && !Array.isArray(data) && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};
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

function countEntries(data: SectionPayload | undefined) {
  if (Array.isArray(data)) return data.length;
  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { rows?: unknown[] }).rows)
  )
    return (data as { rows?: unknown[] }).rows?.length ?? 0;
  if (data && typeof data === "object") {
    const rows =
      (
        data as {
          users?: unknown[];
          members?: unknown[];
          roles?: unknown[];
          invites?: unknown[];
          sessions?: unknown[];
        }
      ).users ??
      (data as { members?: unknown[] }).members ??
      (data as { roles?: unknown[] }).roles ??
      (data as { invites?: unknown[] }).invites ??
      (data as { sessions?: unknown[] }).sessions;
    if (Array.isArray(rows)) return rows.length;
  }
  return 0;
}

function actionDefinition(
  commandId: string,
  title: string,
  variant: "default" | "primary" | "danger" = "default",
): ActionDefinition {
  return {
    id: commandId,
    title,
    commandId,
    intent: "execute",
    variant,
    access: "private",
    risk: "safe",
    placement: "form",
    effects: [],
  };
}

function sectionEyebrow(section: SettingsSection) {
  if (section.id === "interface.builder") return "Interface";
  return null;
}

function sectionSummaryValue(
  section: SettingsSection,
  data: SectionPayload | undefined,
) {
  const rows = rowsFromData(data ?? null);
  if (section.id === "interface.builder") return "Builder";
  if (section.kind === "crud") return `${rows.length} records`;
  if (section.kind === "table") return `${rows.length} rows`;
  if (section.kind === "form") return `${section.fields.length} fields`;
  if (section.kind === "actions") return `${section.actions.length} actions`;
  if (section.kind === "summary") return `${countEntries(data)} items`;
  return `${countEntries(data)} items`;
}

function booleanValue(row: Record<string, unknown>, field: string) {
  const value = row[field];
  return (
    value === true ||
    value === "true" ||
    value === "Installed" ||
    value === "Enabled" ||
    value === "Yes"
  );
}

function arrayValue(
  row: Record<string, unknown>,
  field: string,
): Record<string, unknown>[] {
  const value = row[field];
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
}

function marketplaceAction(section: SettingsSection, commandId: string) {
  return section.rowActions.find((action) => action.commandId === commandId);
}

function actionIcon(
  action:
    | ActionDefinition
    | { title: string; commandId?: string; variant?: string },
) {
  const key = `${action.commandId ?? ""} ${action.title}`.toLowerCase();
  if (key.includes("reload") || key.includes("refresh")) return "↻";
  if (
    key.includes("delete") ||
    key.includes("remove") ||
    key.includes("uninstall") ||
    key.includes("deny")
  )
    return "×";
  if (key.includes("disable") || key.includes("deactivate")) return "○";
  if (key.includes("install") || key.includes("add") || key.includes("create"))
    return "+";
  if (
    key.includes("enable") ||
    key.includes("activate") ||
    key.includes("approve") ||
    key.includes("confirm") ||
    key.includes("save")
  )
    return "✓";
  if (key.includes("edit")) return "✎";
  if (key.includes("view")) return "◎";
  if (key.includes("impersonate")) return "⇄";
  if (key.includes("test") || key.includes("send")) return "✈";
  if (key.includes("close") || key.includes("cancel")) return "×";
  return "•";
}

function buttonClass(action: Pick<ActionDefinition, "variant">, extra = "") {
  return [
    action.variant === "primary"
      ? "primary"
      : action.variant === "danger"
        ? "danger"
        : "",
    "settings-icon-button",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

function IconButton({
  action,
  disabled,
  onClick,
  type,
}: {
  action: ActionDefinition;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <Button
      aria-label={action.title}
      className={buttonClass(action)}
      disabled={disabled}
      onClick={onClick}
      title={action.title}
      type={type}
    >
      {actionIcon(action)}
    </Button>
  );
}

export function SettingsRenderer({
  panel,
  shell,
  onShellChange,
  emit,
}: SettingsRendererProps) {
  const [loaded, setLoaded] = useState<Record<string, LoadedSection>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("Loading saved configuration...");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageLevel, setMessageLevel] = useState<
    "success" | "error" | "info"
  >("info");
  const [marketplaceScope, setMarketplaceScope] = useState<
    "all" | "global" | "workspace"
  >("all");
  const [marketplaceSearch, setMarketplaceSearch] = useState("");
  const [tableSearchBySection, setTableSearchBySection] = useState<Record<string, string>>({});
  const [pendingTargetByPluginId, setPendingTargetByPluginId] = useState<
    Record<string, string>
  >({});
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const sectionIds = useMemo(
    () =>
      panel.sections
        .map((section) => section.dataSourceId)
        .filter((value): value is string => Boolean(value)),
    [panel.sections],
  );
  const fallbackPage = panel.schema;

  useEffect(() => {
    let alive = true;
    if (!panel.sections.length) {
      setStatus("");
      return () => {
        alive = false;
      };
    }
    setStatus("Loading saved configuration...");
    void Promise.all(
      panel.sections.map(async (section) => {
        if (!section.dataSourceId)
          return [section.id, { data: null, error: null }] as const;
        try {
          const result = await loadRuntimeData(panel.id, section.dataSourceId);
          if (result.status !== "ok")
            return [
              section.id,
              {
                data: null,
                error: result.error ?? "Configuration could not be loaded.",
              },
            ] as const;
          return [section.id, { data: result.data, error: null }] as const;
        } catch (error) {
          return [
            section.id,
            {
              data: null,
              error:
                error instanceof Error
                  ? error.message
                  : "Configuration could not be loaded.",
            },
          ] as const;
        }
      }),
    ).then((entries) => {
      if (!alive) return;
      const nextLoaded = Object.fromEntries(entries);
      setLoaded(nextLoaded);
      setOpenSections((current) => {
        const next = { ...current };
        for (const [index, section] of panel.sections.entries()) {
          if (next[section.id] === undefined) next[section.id] = index === 0;
          if (nextLoaded[section.id]?.error) next[section.id] = true;
        }
        return next;
      });
      setStatus("Saved configuration loaded");
    });
    return () => {
      alive = false;
    };
  }, [panel.id, refreshNonce, sectionIds.join("|")]);

  const refresh = () => setRefreshNonce((value) => value + 1);
  const showFeedback = (level: "success" | "error" | "info", text: string) => {
    setMessageLevel(level);
    setMessage(text);
    if (emit && level !== "info")
      emit(
        createSettingsNotification(
          level,
          level === "success" ? "Changes saved" : "Action failed",
          text,
        ),
      );
  };

  const runAction = async (
    action: ActionDefinition,
    row?: Record<string, unknown> | null,
    values?: Record<string, unknown>,
  ) => {
    setSubmitting(true);
    setMessage(null);
    try {
      const payload = { ...(row ?? {}), ...(values ?? {}) };
      const result = await executeRuntimeAction(
        panel.id,
        action.commandId,
        payload,
      );
      if (result.status !== "ok") {
        if (result.status === "approval-required") {
          const approvalMessage = result.approvalId
            ? `Approval required: ${result.approvalId}`
            : "Approval required before this action can continue.";
          showFeedback("info", approvalMessage);
          refresh();
          return false;
        }
        showFeedback("error", result.error ?? "Changes could not be saved.");
        return false;
      }
      const toastEffect = action.effects.find(
        (effect) => effect.type === "toast",
      );
      showFeedback(
        "success",
        toastEffect?.type === "toast" && toastEffect.message
          ? toastEffect.message
          : "Changes saved successfully.",
      );
      refresh();
      for (const effect of action.effects) {
        if (effect.type === "closeDialog") setPendingAction(null);
        if (effect.type === "navigate") window.location.assign(effect.to);
      }
      return true;
    } catch (error) {
      showFeedback(
        "error",
        error instanceof Error ? error.message : "Changes could not be saved.",
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const submitPendingAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingAction) return;
    const values = parseFormValues(
      pendingAction.action.confirmation?.fields ?? [],
      event.currentTarget,
    );
    if (
      pendingAction.action.confirmation?.reasonRequired &&
      !String(values.reason ?? "").trim()
    ) {
      showFeedback("error", "A reason is required before continuing.");
      return;
    }
    const succeeded = await runAction(
      pendingAction.action,
      pendingAction.row,
      values,
    );
    if (
      succeeded &&
      !pendingAction.action.effects.some(
        (effect) => effect.type === "closeDialog",
      )
    )
      setPendingAction(null);
  };

  const submitPackageImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!importFile) {
      showFeedback("error", "Select a ZIP plugin package first.");
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      const result = await uploadPlugin(importFile);
      if (result.status === "approval-required") {
        showFeedback(
          "info",
          result.approvalId
            ? `Approval required: ${result.approvalId}`
            : "Approval required before this package can be installed.",
        );
      } else {
        showFeedback(
          "success",
          result.manifest
            ? `${result.manifest.name} imported and installed.`
            : "Plugin package imported.",
        );
      }
      setImportFile(null);
      event.currentTarget.reset();
      refresh();
    } catch (error) {
      showFeedback(
        "error",
        error instanceof Error
          ? error.message
          : "Plugin package could not be imported.",
      );
    } finally {
      setImporting(false);
    }
  };

  if (!panel.sections.length)
    return (
      <TemplateRenderer
        page={fallbackPage}
        runtime={{ contributionId: panel.id }}
      />
    );

  return (
    <div className="settings-renderer">
      <SurfaceCard className="settings-panel-frame">
        {message ? (
          <div
            className={`settings-feedback ${messageLevel}`}
            role={messageLevel === "error" ? "alert" : "status"}
          >
            {message}
          </div>
        ) : null}
        <div className="settings-section-list">
          {panel.sections.map((section) => {
            const sectionData = loaded[section.id]?.data ?? null;
            const sectionError = loaded[section.id]?.error;
            const rows = rowsFromData(sectionData);
            const tableSearch = (tableSearchBySection[section.id] ?? "").trim().toLowerCase();
            const searchableTable = section.kind === "table" && rows.length > 10;
            const tableRows = searchableTable && tableSearch
              ? rows.filter((row) => rowSearchText(row, section.columns).includes(tableSearch))
              : rows;
            const isOpen = openSections[section.id] ?? false;
            return (
              <details
                className="settings-section-accordion settings-resource-card settings-subpanel"
                id={`settings-section-${section.id}`}
                key={section.id}
                open={isOpen}
                onToggle={(event) => {
                  const open = event.currentTarget.open;
                  setOpenSections((current) => ({
                    ...current,
                    [section.id]: open,
                  }));
                }}
              >
                <summary className="settings-section-summary">
                  <div className="settings-section-summary-copy">
                    {sectionEyebrow(section) ? (
                      <p className="eyebrow">{sectionEyebrow(section)}</p>
                    ) : null}
                    <div className="settings-section-title">
                      <h3>{section.title}</h3>
                      {section.description ? (
                        <p>{section.description}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="settings-section-summary-meta">
                    <Badge>{sectionSummaryValue(section, sectionData)}</Badge>
                    {sectionError ? <Badge>Attention</Badge> : null}
                  </div>
                </summary>
                <div className="settings-section-body">
                  {sectionError ? (
                    <p className="settings-inline-error">{sectionError}</p>
                  ) : null}
                  {section.id === "interface.builder" ? (
                    <div className="stack">
                      <ShellBuilder />
                      {section.actions.length ? (
                        <div className="plugin-actions settings-section-actions">
                          {section.actions.map((action) => (
                            <IconButton
                              key={action.id}
                              action={action}
                              disabled={submitting}
                              onClick={() =>
                                action.confirmation
                                  ? setPendingAction({ section, action })
                                  : void runAction(action, null, {
                                      layout: shell,
                                    })
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : section.kind === "crud" && section.crud ? (
                    <CrudRenderer
                      compactHeader
                      title={section.title}
                      status={undefined}
                      busy={submitting}
                      rows={rows}
                      columns={section.columns}
                      fields={section.fields}
                      crud={section.crud}
                      onRefresh={refresh}
                      onCreate={(values: Record<string, unknown>) =>
                        runAction(
                          actionDefinition(
                            section.crud!.createActionId,
                            "Add",
                            "primary",
                          ),
                          null,
                          values,
                        )
                      }
                      onUpdate={(
                        row: Record<string, unknown>,
                        values: Record<string, unknown>,
                      ) =>
                        runAction(
                          actionDefinition(
                            section.crud!.updateActionId,
                            "Save",
                            "primary",
                          ),
                          row,
                          values,
                        )
                      }
                      onDelete={(row: Record<string, unknown>) =>
                        runAction(
                          actionDefinition(
                            section.crud!.deleteActionId,
                            "Remove",
                            "danger",
                          ),
                          row,
                          {},
                        )
                      }
                      onRowAction={(
                        action: ActionDefinition,
                        row: Record<string, unknown>,
                      ) => runAction(action, row, {})}
                    />
                  ) : section.kind === "form" ? (
                    <div className="stack">
                      <form
                        className="mail-form"
                        key={`${section.id}:${refreshNonce}:${sectionError ? "error" : sectionData === null ? "loading" : "ready"}`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const values = parseFormValues(
                            section.fields,
                            event.currentTarget,
                          );
                          const action =
                            section.actions.find(
                              (item) => item.intent === "submit",
                            ) ?? section.actions[0];
                          if (action) void runAction(action, null, values);
                        }}
                      >
                        {section.fields.map((field) => {
                          const defaultValue = defaultFieldValue(
                            sectionData,
                            field,
                          );
                          if (field.type === "boolean")
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
                          if (field.type === "select")
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
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            );
                          if (field.type === "textarea")
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
                          return (
                            <label key={field.id}>
                              {field.label}
                              <input
                                name={field.id}
                                type={fieldType(field)}
                                defaultValue={String(defaultValue)}
                                disabled={field.readOnly || submitting}
                                required={field.required}
                                autoComplete={field.autocomplete}
                              />
                            </label>
                          );
                        })}
                        <div className="plugin-actions settings-section-actions">
                          {section.actions.map((action) => (
                            <IconButton
                              key={action.id}
                              action={action}
                              disabled={submitting}
                              type="submit"
                            />
                          ))}
                        </div>
                      </form>
                      {section.id === "security.authentication" &&
                      sectionData &&
                      typeof sectionData === "object" &&
                      Array.isArray(
                        (sectionData as { methods?: unknown[] }).methods,
                      ) ? (
                        <div className="settings-mini-list">
                          {(
                            sectionData as {
                              methods: Array<{
                                id?: string;
                                title?: string;
                                type?: string;
                                status?: string;
                              }>;
                            }
                          ).methods.map((method) => (
                            <div
                              key={method.id ?? method.title}
                              className="settings-mini-row"
                            >
                              <strong>{method.title ?? method.id}</strong>
                              <span>{method.type ?? "method"}</span>
                              <Badge>{method.status ?? "unknown"}</Badge>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : section.id === "marketplace.import" ? (
                    <form
                      className="marketplace-import-panel"
                      onSubmit={submitPackageImport}
                    >
                      <div className="stack">
                        <p className="eyebrow">ZIP package</p>
                        <h3>Import plugin package</h3>
                        <p className="muted">
                          Validated ZIP packages are stored in Core package
                          storage, assessed for sensitive capabilities and
                          installed through the same approval-aware flow as
                          Marketplace releases.
                        </p>
                      </div>
                      <div className="marketplace-import-row">
                        <label className="marketplace-package-file">
                          Package file
                          <input
                            accept=".zip,application/zip"
                            name="file"
                            type="file"
                            disabled={importing || submitting}
                            onChange={(event) =>
                              setImportFile(
                                event.currentTarget.files?.[0] ?? null,
                              )
                            }
                          />
                        </label>
                        <Button
                          className="primary"
                          type="submit"
                          disabled={importing || submitting || !importFile}
                        >
                          {importing ? "Importing..." : "Import ZIP"}
                        </Button>
                      </div>
                    </form>
                  ) : section.id === "marketplace.catalog" ? (
                    <div className="marketplace-layout">
                      {(() => {
                        const search = marketplaceSearch.trim().toLowerCase();
                        const visibleRows = rows.filter((row) => {
                          const scope = valueAt(row, "scope") || "workspace";
                          const scopeMatch =
                            marketplaceScope === "all" ||
                            scope === marketplaceScope;
                          const haystack = [
                            valueAt(row, "name"),
                            valueAt(row, "pluginId"),
                            valueAt(row, "category"),
                            valueAt(row, "description"),
                            valueAt(row, "source"),
                            scope,
                          ]
                            .join(" ")
                            .toLowerCase();
                          return (
                            scopeMatch && (!search || haystack.includes(search))
                          );
                        });
                        const enabledCount = rows.filter(
                          (row) =>
                            booleanValue(row, "activeFlag") ||
                            booleanValue(row, "active"),
                        ).length;
                        const installedCount = rows.filter(
                          (row) =>
                            booleanValue(row, "installedFlag") ||
                            booleanValue(row, "installed"),
                        ).length;
                        const renderGroup = (
                          scope: "global" | "workspace",
                          title: string,
                          description: string,
                        ) => {
                          const groupRows = visibleRows.filter(
                            (row) =>
                              (valueAt(row, "scope") || "workspace") === scope,
                          );
                          if (!groupRows.length) return null;
                          return (
                            <section className="marketplace-group">
                              <div className="marketplace-group-header">
                                <p className="eyebrow">{scope}</p>
                                <h3>{title}</h3>
                                <p>{description}</p>
                              </div>
                              <div className="marketplace-card-list">
                                {groupRows.map((row, index) => {
                                  const installed =
                                    booleanValue(row, "installedFlag") ||
                                    booleanValue(row, "installed");
                                  const active =
                                    booleanValue(row, "activeFlag") ||
                                    booleanValue(row, "active");
                                  const pluginId =
                                    valueAt(row, "pluginId") ||
                                    valueAt(row, "id");
                                  const activeReleaseId =
                                    valueAt(row, "activeReleaseId") ||
                                    valueAt(row, "releaseId");
                                  const latestReleaseId =
                                    valueAt(row, "latestReleaseId") ||
                                    valueAt(row, "releaseId");
                                  const latestVersion =
                                    valueAt(row, "latestVersion") ||
                                    valueAt(row, "version");
                                  const updateAvailable = Boolean(
                                    installed &&
                                    latestReleaseId &&
                                    latestReleaseId !== activeReleaseId,
                                  );
                                  const targets = arrayValue(
                                    row,
                                    "provisioningTargetOptions",
                                  );
                                  const selectedTarget =
                                    pendingTargetByPluginId[pluginId] ??
                                    valueAt(row, "provisioningTarget") ??
                                    "core-default";
                                  const installAction = marketplaceAction(
                                    section,
                                    "platform.settings.marketplace.plugin.install",
                                  );
                                  const updateAction = marketplaceAction(
                                    section,
                                    "platform.settings.marketplace.plugin.update",
                                  );
                                  const activateAction = marketplaceAction(
                                    section,
                                    "platform.settings.marketplace.plugin.activate",
                                  );
                                  const deactivateAction = marketplaceAction(
                                    section,
                                    "platform.settings.marketplace.plugin.deactivate",
                                  );
                                  const uninstallAction = marketplaceAction(
                                    section,
                                    "platform.settings.marketplace.plugin.uninstall",
                                  );
                                  const demoInstallAction = marketplaceAction(
                                    section,
                                    "platform.settings.marketplace.demo.install",
                                  );
                                  const demoRemoveAction = marketplaceAction(
                                    section,
                                    "platform.settings.marketplace.demo.remove",
                                  );
                                  const actionPayload = {
                                    provisioningTarget: selectedTarget,
                                  };
                                  return (
                                    <article
                                      className="marketplace-catalog-card"
                                      key={String(
                                        row.pluginId ?? row.id ?? index,
                                      )}
                                    >
                                      <div className="marketplace-catalog-card-header">
                                        <div className="stack">
                                          <p className="eyebrow">
                                            {valueAt(row, "category") ||
                                              "Plugin"}{" "}
                                            ·{" "}
                                            {valueAt(row, "scope") ||
                                              "workspace"}
                                          </p>
                                          <h3>
                                            {valueAt(row, "name") || pluginId}
                                          </h3>
                                          <p>
                                            {valueAt(row, "description") ||
                                              `Release ${valueAt(row, "version")}`}
                                          </p>
                                        </div>
                                        <div className="marketplace-status-pills">
                                          <Badge>
                                            {installed
                                              ? "Installed"
                                              : "Available"}
                                          </Badge>
                                          <Badge>
                                            {active ? "Enabled" : "Disabled"}
                                          </Badge>
                                          <Badge>
                                            {valueAt(row, "runtimeStatus") ||
                                              "Runtime"}
                                          </Badge>
                                        </div>
                                      </div>
                                      <div className="marketplace-release-summary">
                                        <span>
                                          Current release{" "}
                                          <strong>
                                            {activeReleaseId || "none"}
                                          </strong>
                                        </span>
                                        <span>
                                          Latest release{" "}
                                          <strong>
                                            {latestVersion ||
                                              latestReleaseId ||
                                              "none"}
                                          </strong>
                                        </span>
                                        <span>
                                          Source{" "}
                                          <strong>
                                            {valueAt(row, "source") ||
                                              "catalog"}
                                          </strong>
                                        </span>
                                        <span>
                                          Provisioning{" "}
                                          <strong>
                                            {valueAt(row, "runtimeStatus") ||
                                              "not installed"}
                                          </strong>
                                        </span>
                                        <span>
                                          Target{" "}
                                          <strong>{selectedTarget}</strong>
                                        </span>
                                        <span>
                                          Demo{" "}
                                          <strong>
                                            {valueAt(row, "demoAvailable") ||
                                              "No"}
                                          </strong>
                                        </span>
                                      </div>
                                      <div className="catalog-release-row">
                                        <label className="catalog-release-select">
                                          <span className="eyebrow">
                                            Cloudflare / target
                                          </span>
                                          <select
                                            className="catalog-select"
                                            value={selectedTarget}
                                            disabled={submitting}
                                            onChange={(event) =>
                                              setPendingTargetByPluginId(
                                                (current) => ({
                                                  ...current,
                                                  [pluginId]:
                                                    event.target.value,
                                                }),
                                              )
                                            }
                                          >
                                            {targets.length ? (
                                              targets.map((target) => (
                                                <option
                                                  key={String(target.value)}
                                                  value={String(target.value)}
                                                >
                                                  {valueAt(target, "label")}
                                                </option>
                                              ))
                                            ) : (
                                              <option value="core-default">
                                                Core default
                                              </option>
                                            )}
                                          </select>
                                        </label>
                                      </div>
                                      <div className="catalog-action-row">
                                        {!installed && installAction ? (
                                          <Button
                                            className="primary"
                                            disabled={
                                              submitting || !latestReleaseId
                                            }
                                            onClick={() =>
                                              void runAction(
                                                installAction,
                                                row,
                                                actionPayload,
                                              )
                                            }
                                            type="button"
                                          >
                                            Install
                                          </Button>
                                        ) : null}
                                        {updateAvailable && updateAction ? (
                                          <Button
                                            className="primary"
                                            disabled={
                                              submitting || !latestReleaseId
                                            }
                                            onClick={() =>
                                              void runAction(
                                                updateAction,
                                                row,
                                                actionPayload,
                                              )
                                            }
                                            type="button"
                                          >
                                            Update
                                          </Button>
                                        ) : null}
                                        {installed &&
                                        !active &&
                                        activateAction ? (
                                          <IconButton
                                            action={activateAction}
                                            disabled={submitting}
                                            onClick={() =>
                                              void runAction(
                                                activateAction,
                                                row,
                                                {},
                                              )
                                            }
                                          />
                                        ) : null}
                                        {installed &&
                                        active &&
                                        deactivateAction ? (
                                          <IconButton
                                            action={deactivateAction}
                                            disabled={submitting}
                                            onClick={() =>
                                              void runAction(
                                                deactivateAction,
                                                row,
                                                {},
                                              )
                                            }
                                          />
                                        ) : null}
                                        {installed &&
                                        booleanValue(
                                          row,
                                          "demoAvailableFlag",
                                        ) &&
                                        !booleanValue(
                                          row,
                                          "demoInstalledFlag",
                                        ) &&
                                        demoInstallAction ? (
                                          <Button
                                            disabled={
                                              submitting ||
                                              !valueAt(
                                                row,
                                                "demoInstallOperationId",
                                              )
                                            }
                                            onClick={() =>
                                              void runAction(
                                                demoInstallAction,
                                                row,
                                                {},
                                              )
                                            }
                                            type="button"
                                          >
                                            Install demo
                                          </Button>
                                        ) : null}
                                        {installed &&
                                        booleanValue(
                                          row,
                                          "demoInstalledFlag",
                                        ) &&
                                        demoRemoveAction ? (
                                          <Button
                                            className="danger"
                                            disabled={submitting}
                                            onClick={() =>
                                              demoRemoveAction.confirmation
                                                ? setPendingAction({
                                                    section,
                                                    action: demoRemoveAction,
                                                    row,
                                                  })
                                                : void runAction(
                                                    demoRemoveAction,
                                                    row,
                                                    {},
                                                  )
                                            }
                                            type="button"
                                          >
                                            Remove demo
                                          </Button>
                                        ) : null}
                                        {installed &&
                                        !active &&
                                        uninstallAction ? (
                                          <IconButton
                                            action={uninstallAction}
                                            disabled={submitting}
                                            onClick={() =>
                                              uninstallAction.confirmation
                                                ? setPendingAction({
                                                    section,
                                                    action: uninstallAction,
                                                    row,
                                                  })
                                                : void runAction(
                                                    uninstallAction,
                                                    row,
                                                    {},
                                                  )
                                            }
                                          />
                                        ) : null}
                                        {installed && active ? (
                                          <p className="muted catalog-action-hint">
                                            Disable first to make uninstall
                                            available.
                                          </p>
                                        ) : null}
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        };
                        return (
                          <>
                            <section className="marketplace-toolbar">
                              <div className="marketplace-scope-tabs">
                                {(["all", "global", "workspace"] as const).map(
                                  (scope) => (
                                    <button
                                      key={scope}
                                      className={
                                        marketplaceScope === scope
                                          ? "active"
                                          : ""
                                      }
                                      type="button"
                                      onClick={() => setMarketplaceScope(scope)}
                                    >
                                      {scope === "all"
                                        ? "All"
                                        : scope === "global"
                                          ? "Global"
                                          : "Workspace"}
                                    </button>
                                  ),
                                )}
                              </div>
                              <div className="marketplace-stats">
                                <Badge>{visibleRows.length} visible</Badge>
                                <Badge>{enabledCount} enabled</Badge>
                                <Badge>{installedCount} installed</Badge>
                                <Badge>{rows.length} total</Badge>
                              </div>
                              <label className="marketplace-search">
                                Search plugins
                                <input
                                  value={marketplaceSearch}
                                  onChange={(event) =>
                                    setMarketplaceSearch(event.target.value)
                                  }
                                  placeholder="Search by name, category, scope..."
                                />
                              </label>
                            </section>
                            {renderGroup(
                              "global",
                              "Global plugins",
                              "Available across workspaces; each workspace keeps its own install, release and runtime state.",
                            )}
                            {renderGroup(
                              "workspace",
                              "Workspace plugins",
                              "Packages and releases scoped to this workspace or imported locally.",
                            )}
                            {!visibleRows.length ? (
                              <p>No marketplace plugins found.</p>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ) : section.kind === "table" ? (
                    <div className="stack">
                      {searchableTable ? (
                        <label className="settings-table-search">
                          Search {section.title}
                          <input
                            value={tableSearchBySection[section.id] ?? ""}
                            onChange={(event) =>
                              setTableSearchBySection((current) => ({
                                ...current,
                                [section.id]: event.currentTarget.value,
                              }))
                            }
                            placeholder={`Search ${rows.length} rows...`}
                          />
                        </label>
                      ) : null}
                      <div className="template-table-wrap domain-table">
                        <table>
                          <thead>
                            <tr>
                              {section.columns.map((column) => (
                                <th key={column.id}>{column.label}</th>
                              ))}
                              {section.rowActions.length ? (
                                <th>Actions</th>
                              ) : null}
                            </tr>
                          </thead>
                          <tbody>
                            {tableRows.length ? (
                              tableRows.map((row, index) => (
                                <tr key={String(row.id ?? index)}>
                                  {section.columns.map(
                                    (column: ColumnDefinition) => (
                                      <td key={column.id}>
                                        {renderTableCell(row, column)}
                                      </td>
                                    ),
                                  )}
                                  {section.rowActions.length ? (
                                    <td>
                                      <div className="plugin-actions">
                                        {section.rowActions.map((action) => (
                                          <IconButton
                                            key={action.id}
                                            action={action}
                                            disabled={submitting}
                                            onClick={() =>
                                              action.confirmation
                                                ? setPendingAction({
                                                    section,
                                                    action,
                                                    row,
                                                  })
                                                : void runAction(
                                                    action,
                                                    row,
                                                    {},
                                                  )
                                            }
                                          />
                                        ))}
                                      </div>
                                    </td>
                                  ) : null}
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td
                                  colSpan={
                                    section.columns.length +
                                    (section.rowActions.length ? 1 : 0)
                                  }
                                >
                                  {searchableTable && tableSearch ? "No matching records found." : "No records found."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {section.actions.length ? (
                        <div className="plugin-actions settings-section-actions">
                          {section.actions.map((action) => (
                            <IconButton
                              key={action.id}
                              action={action}
                              disabled={submitting}
                              onClick={() =>
                                action.confirmation
                                  ? setPendingAction({ section, action })
                                  : void runAction(action)
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : section.kind === "actions" ? (
                    <div className="plugin-actions settings-section-actions">
                      {section.actions.map((action) => (
                        <IconButton
                          key={action.id}
                          action={action}
                          disabled={submitting}
                          onClick={() =>
                            action.confirmation
                              ? setPendingAction({ section, action })
                              : void runAction(action)
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </SurfaceCard>
      {pendingAction ? (
        <div className="settings-dialog-backdrop">
          <SurfaceCard className="settings-dialog">
            <div className="surface-header">
              <div>
                <small>{pendingAction.section.title}</small>
                <h3>
                  {pendingAction.action.confirmation?.title ??
                    pendingAction.action.title}
                </h3>
              </div>
              <Button
                aria-label="Close"
                className="settings-icon-button"
                onClick={() => setPendingAction(null)}
                disabled={submitting}
                title="Close"
              >
                ×
              </Button>
            </div>
            {pendingAction.action.confirmation?.message ? (
              <p>{pendingAction.action.confirmation.message}</p>
            ) : null}
            <form className="mail-form" onSubmit={submitPendingAction}>
              {pendingAction.action.confirmation?.reasonRequired ? (
                <label>
                  Reason
                  <textarea name="reason" required disabled={submitting} />
                </label>
              ) : null}
              {pendingAction.action.confirmation?.fields
                .filter(
                  (field) =>
                    !(
                      pendingAction.action.confirmation?.reasonRequired &&
                      field.id === "reason"
                    ),
                )
                .map((field) =>
                  field.type === "boolean" ? (
                    <label className="template-check" key={field.id}>
                      <input
                        name={field.id}
                        type="checkbox"
                        disabled={submitting}
                      />
                      {field.label}
                    </label>
                  ) : field.type === "select" ? (
                    <label key={field.id}>
                      {field.label}
                      <select
                        name={field.id}
                        defaultValue={field.options[0]?.value ?? ""}
                        disabled={submitting}
                        required={field.required}
                      >
                        {field.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : field.type === "textarea" ? (
                    <label key={field.id}>
                      {field.label}
                      <textarea
                        name={field.id}
                        required={field.required}
                        disabled={submitting}
                      />
                    </label>
                  ) : (
                    <label key={field.id}>
                      {field.label}
                      <input
                        name={field.id}
                        type={fieldType(field)}
                        required={field.required}
                        disabled={submitting}
                      />
                    </label>
                  ),
                )}
              <div className="plugin-actions settings-dialog-actions">
                <Button
                  aria-label="Cancel"
                  className="settings-icon-button"
                  onClick={() => setPendingAction(null)}
                  disabled={submitting}
                  title="Cancel"
                  type="button"
                >
                  ×
                </Button>
                <Button
                  aria-label="Confirm"
                  className="primary settings-icon-button"
                  type="submit"
                  disabled={submitting}
                  title="Confirm"
                >
                  ✓
                </Button>
              </div>
            </form>
          </SurfaceCard>
        </div>
      ) : null}
    </div>
  );
}
