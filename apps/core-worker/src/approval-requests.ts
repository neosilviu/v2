import {
  approvalRequestSchema,
  type ApprovalRequest,
  type ApprovalRequestKind,
} from "@v2/rpc-contracts";

type ApprovalRequestRow = {
  id: string;
  workspace_id: string;
  kind: ApprovalRequestKind;
  subject_id: string;
  plugin_id: string | null;
  risk: string;
  payload_json: string;
  status: ApprovalRequest["status"];
  requested_by: string | null;
  decided_by: string | null;
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
  consumed_at: string | null;
  reason: string | null;
};

export type ApprovalRequestCreate = {
  workspaceId: string;
  kind: ApprovalRequestKind;
  subjectId: string;
  pluginId?: string | null;
  risk: string;
  payload: Record<string, unknown>;
  requestedBy?: string | null | undefined;
  expiresAt?: string | null | undefined;
};

export class ApprovalRequestRepository {
  constructor(private readonly db: D1Database) {}

  private mapped(row: ApprovalRequestRow): ApprovalRequest {
    return approvalRequestSchema.parse({
      id: row.id,
      workspaceId: row.workspace_id,
      kind: row.kind,
      subjectId: row.subject_id,
      pluginId: row.plugin_id,
      risk: row.risk,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      status: row.status,
      requestedBy: row.requested_by,
      decidedBy: row.decided_by,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      reason: row.reason,
    });
  }

  async create(input: ApprovalRequestCreate): Promise<ApprovalRequest> {
    const id = crypto.randomUUID();
    const row = await this.db
      .prepare(
        `INSERT INTO approval_requests
      (id, workspace_id, kind, subject_id, plugin_id, risk, payload_json, requested_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, workspace_id, kind, subject_id, plugin_id, risk, payload_json, status, requested_by, decided_by, requested_at, decided_at, expires_at, consumed_at, reason`,
      )
      .bind(
        id,
        input.workspaceId,
        input.kind,
        input.subjectId,
        input.pluginId ?? null,
        input.risk,
        JSON.stringify(input.payload),
        input.requestedBy ?? null,
        input.expiresAt ?? null,
      )
      .first<ApprovalRequestRow>();
    if (!row) throw new Error("Approval request could not be created");
    return this.mapped(row);
  }

  async listPending(workspaceId: string): Promise<ApprovalRequest[]> {
    const rows = await this.db
      .prepare(
        `SELECT id, workspace_id, kind, subject_id, plugin_id, risk, payload_json, status, requested_by, decided_by, requested_at, decided_at, expires_at, consumed_at, reason
      FROM approval_requests
      WHERE workspace_id = ? AND status = 'pending'
      ORDER BY requested_at`,
      )
      .bind(workspaceId)
      .all<ApprovalRequestRow>();
    return rows.results.map((row) => this.mapped(row));
  }

  async decide(
    workspaceId: string,
    approvalId: string,
    decision: "approved" | "denied",
    actorId?: string,
    reason?: string,
  ): Promise<ApprovalRequest | undefined> {
    const row = await this.db
      .prepare(
        `UPDATE approval_requests
      SET status = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, reason = ?
      WHERE id = ? AND workspace_id = ? AND status = 'pending'
      RETURNING id, workspace_id, kind, subject_id, plugin_id, risk, payload_json, status, requested_by, decided_by, requested_at, decided_at, expires_at, consumed_at, reason`,
      )
      .bind(decision, actorId ?? null, reason ?? null, approvalId, workspaceId)
      .first<ApprovalRequestRow>();
    return row ? this.mapped(row) : undefined;
  }

  async consume(approvalId: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE approval_requests SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'approved'",
      )
      .bind(approvalId)
      .run();
  }

  async claimApproved(input: {
    workspaceId: string;
    approvalId: string;
    kind: ApprovalRequestKind;
    subjectId?: string;
    pluginId?: string;
  }): Promise<ApprovalRequest | undefined> {
    const row = await this.db
      .prepare(
        `UPDATE approval_requests
      SET status = 'consumed', consumed_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND workspace_id = ?
        AND kind = ?
        AND status = 'approved'
        AND (? IS NULL OR subject_id = ?)
        AND (? IS NULL OR plugin_id = ?)
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      RETURNING id, workspace_id, kind, subject_id, plugin_id, risk, payload_json, status, requested_by, decided_by, requested_at, decided_at, expires_at, consumed_at, reason`,
      )
      .bind(
        input.approvalId,
        input.workspaceId,
        input.kind,
        input.subjectId ?? null,
        input.subjectId ?? null,
        input.pluginId ?? null,
        input.pluginId ?? null,
      )
      .first<ApprovalRequestRow>();
    return row ? this.mapped(row) : undefined;
  }

  async get(
    workspaceId: string,
    approvalId: string,
  ): Promise<ApprovalRequest | undefined> {
    const row = await this.db
      .prepare(
        `SELECT id, workspace_id, kind, subject_id, plugin_id, risk, payload_json, status, requested_by, decided_by, requested_at, decided_at, expires_at, consumed_at, reason
      FROM approval_requests
      WHERE workspace_id = ? AND id = ?`,
      )
      .bind(workspaceId, approvalId)
      .first<ApprovalRequestRow>();
    return row ? this.mapped(row) : undefined;
  }
}
