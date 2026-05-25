import { Badge, Button } from "@v2/ui-kit";
import type { ToolContribution } from "../runtime-types";

export function ToolApprovalDialog({ tool, onApprove, onCancel }: { tool: ToolContribution | null; onApprove: () => void; onCancel: () => void }) {
  if (!tool) return null;
  return <div className="palette-backdrop"><div className="approval"><div className="surface-header"><h2>Approval required</h2><Badge>{tool.risk}</Badge></div><p><strong>{tool.title}</strong> requests execution through the runtime policy layer.</p><small>{tool.id}</small><div className="actions"><Button onClick={onCancel}>Cancel</Button><Button onClick={onApprove}>Approve once</Button></div></div></div>;
}
