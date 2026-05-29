import { useEffect, useState } from "react";
import type { ApprovalRequest, ToolApproval } from "@v2/rpc-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { approveToolApproval, decideApprovalRequest, denyToolApproval, loadCoreSession, loadPendingApprovalRequests, loadPendingToolApprovals } from "../api";

function approvalTitle(approval: ApprovalRequest) {
  if (approval.kind.includes("install")) return "Install plugin";
  if (approval.kind.includes("activate")) return "Activate plugin";
  if (approval.kind.includes("deactivate")) return "Deactivate plugin";
  if (approval.kind.includes("upload")) return "Upload plugin package";
  return approval.kind.replace(/[_-]+/g, " ").replace(/^./, (char) => char.toUpperCase());
}

function approvalSummary(approval: ApprovalRequest) {
  const owner = approval.pluginId ? "Plugin request" : "Platform request";
  const when = new Date(approval.requestedAt).toLocaleString();
  return `${owner} · ${when}`;
}

function pluginRiskSummary(approval: ApprovalRequest) {
  if (!approval.kind.startsWith("plugin_")) return null;
  const version = String(approval.payload.version ?? "").trim();
  const capabilities = Array.isArray(approval.payload.sensitiveCapabilities)
    ? approval.payload.sensitiveCapabilities.length
    : 0;
  return [
    version ? `Release ${version}` : "Release pending review",
    capabilities ? `${capabilities} sensitive capability${capabilities === 1 ? "" : "ies"}` : "No sensitive capabilities declared",
  ].join(" · ");
}

export function ApprovalsPanel({ onDecision }: { onDecision?: () => void }) {
  const [approvals, setApprovals] = useState<ToolApproval[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [status, setStatus] = useState("Checking platform admin access...");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void loadCoreSession().then((session) => {
      const isAdmin = session.isSuperadmin ?? session.isAdmin;
      setIsAdmin(isAdmin);
      setStatus(isAdmin ? "Ready to load pending approvals" : "Sign in as a platform admin to manage approvals");
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
      const [pending, generic] = await Promise.all([loadPendingToolApprovals(), loadPendingApprovalRequests()]);
      setApprovals(pending);
      setRequests(generic);
      const total = pending.length + generic.length;
      setStatus(total ? `${total} pending approval${total === 1 ? "" : "s"}` : "No pending approvals");
    } catch {
      setApprovals([]);
      setRequests([]);
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
  const decideGeneric = async (approvalId: string, decision: "approved" | "denied") => {
    setBusyId(approvalId);
    try {
      await decideApprovalRequest(approvalId, decision);
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
      {requests.map((approval) => <div className="approval-row" key={approval.id}>
        <div>
          <strong>{approvalTitle(approval)}</strong>
          <small>{approvalSummary(approval)}</small>
          {pluginRiskSummary(approval) ? <small>{pluginRiskSummary(approval)}</small> : null}
        </div>
        <Badge>{approval.risk}</Badge>
        <div className="approval-actions">
          <Button disabled={busyId === approval.id} onClick={() => void decideGeneric(approval.id, "denied")}>Deny</Button>
          <Button disabled={busyId === approval.id} onClick={() => void decideGeneric(approval.id, "approved")}>Approve</Button>
        </div>
      </div>)}
      {approvals.map((approval) => <div className="approval-row" key={approval.id}>
        <div>
          <strong>Run workspace tool</strong>
          <small>{approval.pluginId ? "Plugin tool" : "Platform tool"} · {new Date(approval.requestedAt).toLocaleString()}</small>
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
