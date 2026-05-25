import { useEffect, useMemo, useState } from "react";
import type { SettingContribution } from "@v2/plugin-contracts";
import { Button, SurfaceCard } from "@v2/ui-kit";
import { loadSettings, saveSetting } from "../api";

type SettingSection = { pluginId: string; setting: SettingContribution };
type Scope = `plugin:${string}`;

function defaultValue(field: SettingContribution["fields"][number]) {
  if (field.type === "boolean") return false;
  if (field.type === "number") return 0;
  if (field.type === "color") return "#7c8cff";
  if (field.type === "select") return field.options?.[0] ?? "";
  return "";
}

export function SettingsRenderer({ sections }: { sections: SettingSection[] }) {
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>({});
  const [status, setStatus] = useState("Settings are loaded from Core workspace storage");
  const scopes = useMemo(() => Array.from(new Set(sections.map((section) => `plugin:${section.pluginId}` as Scope))), [sections]);

  useEffect(() => {
    void Promise.all(scopes.map(async (scope) => [scope, await loadSettings(scope)] as const)).then((loaded) => {
      setValues(Object.fromEntries(loaded));
      setStatus("Settings loaded");
    }).catch(() => setStatus("Settings could not be loaded from Core"));
  }, [scopes]);

  const update = (scope: Scope, key: string, value: unknown) => {
    setValues((current) => ({ ...current, [scope]: { ...current[scope], [key]: value } }));
  };

  const save = async (scope: Scope, key: string) => {
    try {
      await saveSetting(scope, key, values[scope]?.[key]);
      setStatus(`Saved ${key}`);
    } catch {
      setStatus("Setting was not saved. Admin access may be required.");
    }
  };

  return <SurfaceCard>
    <small>core workspace storage</small><h2>Plugin Settings</h2>
    <p>{status}</p>
    {sections.length ? sections.map(({ pluginId, setting }) => {
      const scope = `plugin:${pluginId}` as Scope;
      return <div className="settings-section" key={setting.id}>
        <strong>{setting.title}</strong>
        {setting.fields.map((field) => {
          const value = values[scope]?.[field.key] ?? defaultValue(field);
          return <label className="field" key={`${scope}:${field.key}`}>
            <span>{field.label}</span>
            {field.type === "color" ? <input type="color" value={String(value)} onChange={(event) => update(scope, field.key, event.target.value)} /> : null}
            {field.type === "select" ? <select value={String(value)} onChange={(event) => update(scope, field.key, event.target.value)}>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : null}
            {field.type === "boolean" ? <input type="checkbox" checked={Boolean(value)} onChange={(event) => update(scope, field.key, event.target.checked)} /> : null}
            {field.type === "number" ? <input type="number" value={Number(value)} onChange={(event) => update(scope, field.key, Number(event.target.value))} /> : null}
            {field.type === "string" ? <input value={String(value)} onChange={(event) => update(scope, field.key, event.target.value)} /> : null}
            <Button onClick={() => void save(scope, field.key)}>Save</Button>
          </label>;
        })}
      </div>;
    }) : <p>No plugin settings are active in this workspace.</p>}
  </SurfaceCard>;
}
