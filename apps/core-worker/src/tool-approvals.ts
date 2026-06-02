import type { ToolApproval } from "@v2/rpc-contracts";

type ApprovalRow = {
  id: string;
  workspace_id: string;
  plugin_id: string;
  tool_id: string;
  risk: string;
  input_json: string | null;
  status: ToolApproval["status"];
  requested_at: string;
  decided_at: string | null;
  consumed_at: string | null;
};
export type ApprovedToolInput = { approval: ToolApproval; input: unknown };
export class ToolApprovalRepository {
  constructor(private readonly db: D1Database) {}
  private mapped(row: ApprovalRow): ToolApproval {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      pluginId: row.plugin_id,
      toolId: row.tool_id,
      risk: row.risk,
      status: row.status,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      consumedAt: row.consumed_at,
    };
  }
  async create(
    workspaceId: string,
    pluginId: string,
    toolId: string,
    risk: string,
    input: unknown,
    requestedBy?: string,
  ): Promise<ToolApproval> {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        "INSERT INTO tool_approvals (id, workspace_id, plugin_id, tool_id, risk, input_json, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        workspaceId,
        pluginId,
        toolId,
        risk,
        input === undefined ? null : JSON.stringify(input),
        requestedBy ?? null,
      )
      .run();
    return {
      id,
      workspaceId,
      pluginId,
      toolId,
      risk,
      status: "pending",
      requestedAt: new Date().toISOString(),
      decidedAt: null,
      consumedAt: null,
    };
  }
  async listPending(workspaceId: string): Promise<ToolApproval[]> {
    const rows = await this.db
      .prepare(
        "SELECT id, workspace_id, plugin_id, tool_id, risk, input_json, status, requested_at, decided_at, consumed_at FROM tool_approvals WHERE workspace_id = ? AND status = 'pending' ORDER BY requested_at",
      )
      .bind(workspaceId)
      .all<ApprovalRow>();
    return rows.results.map((row) => this.mapped(row));
  }
  async decide(
    workspaceId: string,
    approvalId: string,
    decision: "approved" | "denied",
    actorId?: string,
  ): Promise<ToolApproval | undefined> {
    const row = await this.db
      .prepare(
        "UPDATE tool_approvals SET status = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ? AND status = 'pending' RETURNING id, workspace_id, plugin_id, tool_id, risk, input_json, status, requested_at, decided_at, consumed_at",
      )
      .bind(decision, actorId ?? null, approvalId, workspaceId)
      .first<ApprovalRow>();
    return row ? this.mapped(row) : undefined;
  }
  async approvedInput(
    workspaceId: string,
    approvalId: string,
    pluginId: string,
    toolId: string,
  ): Promise<ApprovedToolInput | undefined> {
    const row = await this.db
      .prepare(
        "UPDATE tool_approvals SET status = 'executing' WHERE id = ? AND workspace_id = ? AND plugin_id = ? AND tool_id = ? AND status = 'approved' RETURNING id, workspace_id, plugin_id, tool_id, risk, input_json, status, requested_at, decided_at, consumed_at",
      )
      .bind(approvalId, workspaceId, pluginId, toolId)
      .first<ApprovalRow>();
    return row
      ? {
          approval: this.mapped(row),
          input: row.input_json
            ? (JSON.parse(row.input_json) as unknown)
            : undefined,
        }
      : undefined;
  }
  async consume(approvalId: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE tool_approvals SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'executing'",
      )
      .bind(approvalId)
      .run();
  }
  async release(approvalId: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE tool_approvals SET status = 'approved' WHERE id = ? AND status = 'executing'",
      )
      .bind(approvalId)
      .run();
  }
  async fail(approvalId: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE tool_approvals SET status = 'failed' WHERE id = ? AND status = 'executing'",
      )
      .bind(approvalId)
      .run();
  }
  async get(approvalId: string): Promise<ToolApproval | undefined> {
    const row = await this.db
      .prepare(
        "SELECT id, workspace_id, plugin_id, tool_id, risk, input_json, status, requested_at, decided_at, consumed_at FROM tool_approvals WHERE id = ?",
      )
      .bind(approvalId)
      .first<ApprovalRow>();
    return row ? this.mapped(row) : undefined;
  }
  async getForWorkspace(
    workspaceId: string,
    approvalId: string,
  ): Promise<ToolApproval | undefined> {
    const row = await this.db
      .prepare(
        "SELECT id, workspace_id, plugin_id, tool_id, risk, input_json, status, requested_at, decided_at, consumed_at FROM tool_approvals WHERE id = ? AND workspace_id = ?",
      )
      .bind(approvalId, workspaceId)
      .first<ApprovalRow>();
    return row ? this.mapped(row) : undefined;
  }
}
