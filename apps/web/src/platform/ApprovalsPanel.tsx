import { useEffect, useState } from "react";
import type { ToolApproval } from "@v2/rpc-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { approveToolApproval, denyToolApproval, loadCoreSession, loadPendingToolApprovals } from "../api";

export function ApprovalsPanel({ onDecision }: { onDecision?: () => void }) {
  const [approvals, setApprovals] = useState<ToolApproval[]>([]);
  const [status, setStatus] = useState("Checking platform admin access...");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void loadCoreSession().then((session) => {
      setIsAdmin(session.isAdmin);
      setStatus(session.isAdmin ? "Ready to load pending approvals" : "Sign in as a platform admin to manage approvals");
    }).catch(() => {
      setIsAdmin(false);
      setStatus("Core session could not be checked");
    });
  }, []);

  const refresh = async () => {
    if (!isAdmin) {
      setStatus("Platform admin access required to load approvals");
      return;
    }
    try {
      const pending = await loadPendingToolApprovals();
      setApprovals(pending);
      setStatus(pending.length ? `${pending.length} pending approval${pending.length === 1 ? "" : "s"}` : "No pending approvals");
    } catch {
      setApprovals([]);
      setStatus("Approvals require platform admin access");
    }
  };

  const decide = async (approvalId: string, decision: "approved" | "denied") => {
    setBusyId(approvalId);
    try {
      if (decision === "approved") await approveToolApproval(approvalId);
      else await denyToolApproval(approvalId);
      await refresh();
      onDecision?.();
    } catch {
      setStatus("Approval decision failed");
    } finally {
      setBusyId(null);
    }
  };

  return <SurfaceCard className="approvals-panel">
    <div className="surface-header">
      <div><small>core policy</small><h2>Approvals</h2></div>
      <Button disabled={!isAdmin} onClick={() => void refresh()}>Refresh</Button>
    </div>
    <p>{status}</p>
    <div className="approval-list">
      {approvals.map((approval) => <div className="approval-row" key={approval.id}>
        <div>
          <strong>{approval.toolId}</strong>
          <small>{approval.pluginId} · {approval.id.slice(0, 8)} · {new Date(approval.requestedAt).toLocaleTimeString()}</small>
        </div>
        <Badge>{approval.risk}</Badge>
        <div className="approval-actions">
          <Button disabled={busyId === approval.id} onClick={() => void decide(approval.id, "denied")}>Deny</Button>
          <Button disabled={busyId === approval.id} onClick={() => void decide(approval.id, "approved")}>Approve</Button>
        </div>
      </div>)}
    </div>
  </SurfaceCard>;
}
