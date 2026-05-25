import type { SettingContribution } from "@v2/plugin-contracts";
import { SurfaceCard } from "@v2/ui-kit";

export function SettingsRenderer({ settings }: { settings: SettingContribution[] }) {
  return <SurfaceCard>
    <small>declarative settings</small><h2>Appearance</h2>
    {settings.flatMap((section) => section.fields).map((field) => <label className="field" key={field.key}><span>{field.label}</span>{field.type === "color" ? <input type="color" defaultValue="#7c8cff" /> : field.type === "select" ? <select>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <input type={field.type === "boolean" ? "checkbox" : "text"} />}</label>)}
  </SurfaceCard>;
}
