import { useMemo, useState } from "react";
import type { ToolContribution } from "@v2/plugin-contracts";
import { Badge } from "@v2/ui-kit";

export function CommandPalette({ tools, open, onClose }: { tools: ToolContribution[]; open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => tools.filter((tool) => `${tool.title} ${tool.id}`.toLowerCase().includes(query.toLowerCase())), [query, tools]);
  if (!open) return null;
  return <div className="palette-backdrop" onClick={onClose}>
    <div className="palette" onClick={(event) => event.stopPropagation()}>
      <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands and runtime tools…" />
      <div className="palette-list">{results.map((tool) => <button className="palette-item" key={tool.id} onClick={onClose}><div><strong>{tool.title}</strong><small>{tool.id}</small></div><Badge>{tool.risk}</Badge></button>)}</div>
    </div>
  </div>;
}
