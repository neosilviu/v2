import type { AgentChannel, AgentMessage, AgentProviderBinding, AgentRun, AgentToolCall, AgentToolCallStatus } from "@v2/agent-contracts";
import type { ToolExecutionResult } from "@v2/rpc-contracts";

type ToolCallRow = {
  id: string;
  run_id: string;
  channel_id: string;
  tool_id: string;
  input_json: string;
  approval_id: string | null;
  status: AgentToolCallStatus;
  result_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function parseJson(value: string | null): unknown {
  if (!value) return null;
  return JSON.parse(value) as unknown;
}

function mapToolCall(row: ToolCallRow): AgentToolCall {
  return {
    id: row.id,
    runId: row.run_id,
    channelId: row.channel_id,
    toolId: row.tool_id,
    input: parseJson(row.input_json),
    approvalId: row.approval_id,
    status: row.status,
    result: row.result_json ? parseJson(row.result_json) as ToolExecutionResult : null,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export class AgentRepository {
  constructor(private readonly db: D1Database) {}

  async ensureDefaultChannel(workspaceId: string): Promise<void> { await this.db.prepare("INSERT OR IGNORE INTO agent_channels (id, workspace_id, title) VALUES (?, ?, ?)").bind(`${workspaceId}.general`, workspaceId, "General").run(); }
  async listChannels(workspaceId: string): Promise<AgentChannel[]> { await this.ensureDefaultChannel(workspaceId); const rows = await this.db.prepare("SELECT id, workspace_id, title, provider_binding_id, created_at FROM agent_channels WHERE workspace_id = ? ORDER BY created_at").bind(workspaceId).all<{ id: string; workspace_id: string; title: string; provider_binding_id: string | null; created_at: string }>(); return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, title: row.title, providerId: row.provider_binding_id, createdAt: row.created_at })); }
  async getChannel(channelId: string): Promise<AgentChannel | undefined> { const row = await this.db.prepare("SELECT id, workspace_id, title, provider_binding_id, created_at FROM agent_channels WHERE id = ?").bind(channelId).first<{ id: string; workspace_id: string; title: string; provider_binding_id: string | null; created_at: string }>(); return row ? { id: row.id, workspaceId: row.workspace_id, title: row.title, providerId: row.provider_binding_id, createdAt: row.created_at } : undefined; }
  async createChannel(workspaceId: string, title: string, providerId: string | null): Promise<AgentChannel> { const id = `${workspaceId}.${crypto.randomUUID()}`; await this.db.prepare("INSERT INTO agent_channels (id, workspace_id, title, provider_binding_id) VALUES (?, ?, ?, ?)").bind(id, workspaceId, title, providerId).run(); return { id, workspaceId, title, providerId, createdAt: new Date().toISOString() }; }
  async setChannelProvider(channelId: string, providerId: string | null): Promise<void> { await this.db.prepare("UPDATE agent_channels SET provider_binding_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(providerId, channelId).run(); }
  async listProviders(workspaceId: string): Promise<AgentProviderBinding[]> { const rows = await this.db.prepare("SELECT id, workspace_id, contribution_id, connection_id, title, model, status, created_at FROM agent_provider_bindings WHERE workspace_id = ? ORDER BY created_at").bind(workspaceId).all<{ id: string; workspace_id: string; contribution_id: string; connection_id: string | null; title: string; model: string; status: AgentProviderBinding["status"]; created_at: string }>(); return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, contributionId: row.contribution_id, connectionId: row.connection_id, title: row.title, model: row.model, status: row.status, createdAt: row.created_at })); }
  async getProvider(id: string): Promise<AgentProviderBinding | undefined> { const row = await this.db.prepare("SELECT id, workspace_id, contribution_id, connection_id, title, model, status, created_at FROM agent_provider_bindings WHERE id = ?").bind(id).first<{ id: string; workspace_id: string; contribution_id: string; connection_id: string | null; title: string; model: string; status: AgentProviderBinding["status"]; created_at: string }>(); return row ? { id: row.id, workspaceId: row.workspace_id, contributionId: row.contribution_id, connectionId: row.connection_id, title: row.title, model: row.model, status: row.status, createdAt: row.created_at } : undefined; }
  async createProvider(workspaceId: string, contributionId: string, connectionId: string, title: string, model: string): Promise<AgentProviderBinding> { const id = `${workspaceId}.${crypto.randomUUID()}`; const status = "unavailable" as const; await this.db.prepare("INSERT INTO agent_provider_bindings (id, workspace_id, contribution_id, connection_id, title, model, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, workspaceId, contributionId, connectionId, title, model, status).run(); return { id, workspaceId, contributionId, connectionId, title, model, status, createdAt: new Date().toISOString() }; }
  async listMessages(channelId: string): Promise<AgentMessage[]> { const rows = await this.db.prepare("SELECT id, channel_id, role, content, created_at FROM agent_messages WHERE channel_id = ? ORDER BY created_at").bind(channelId).all<{ id: string; channel_id: string; role: AgentMessage["role"]; content: string; created_at: string }>(); return rows.results.map((row) => ({ id: row.id, channelId: row.channel_id, role: row.role, content: row.content, createdAt: row.created_at })); }
  async addMessage(channelId: string, role: AgentMessage["role"], content: string): Promise<AgentMessage> { const id = crypto.randomUUID(); await this.db.prepare("INSERT INTO agent_messages (id, channel_id, role, content) VALUES (?, ?, ?, ?)").bind(id, channelId, role, content).run(); return { id, channelId, role, content, createdAt: new Date().toISOString() }; }
  async createRun(channelId: string, providerId: string | null): Promise<AgentRun> { const id = crypto.randomUUID(); const status = providerId ? "running" as const : "provider-required" as const; await this.db.prepare("INSERT INTO agent_runs (id, channel_id, provider_binding_id, status) VALUES (?, ?, ?, ?)").bind(id, channelId, providerId, status).run(); return { id, channelId, providerId, status, createdAt: new Date().toISOString() }; }
  async completeRun(runId: string, outputMessageId: string): Promise<void> { await this.db.prepare("UPDATE agent_runs SET status = 'completed', output_message_id = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(outputMessageId, runId).run(); }
  async failRun(runId: string, message: string): Promise<void> { await this.db.prepare("UPDATE agent_runs SET status = 'failed', error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(message, runId).run(); }

  async createToolRun(channelId: string): Promise<AgentRun> {
    const id = crypto.randomUUID();
    await this.db.prepare("INSERT INTO agent_runs (id, channel_id, provider_binding_id, status) VALUES (?, ?, NULL, 'running')").bind(id, channelId).run();
    return { id, channelId, providerId: null, status: "running", createdAt: new Date().toISOString() };
  }

  async getRun(runId: string): Promise<AgentRun | undefined> {
    const row = await this.db.prepare("SELECT id, channel_id, provider_binding_id, status, created_at FROM agent_runs WHERE id = ?").bind(runId).first<{ id: string; channel_id: string; provider_binding_id: string | null; status: AgentRun["status"]; created_at: string }>();
    return row ? { id: row.id, channelId: row.channel_id, providerId: row.provider_binding_id, status: row.status, createdAt: row.created_at } : undefined;
  }

  async listToolCallsForChannel(channelId: string): Promise<AgentToolCall[]> {
    const rows = await this.db.prepare("SELECT id, run_id, channel_id, tool_id, input_json, approval_id, status, result_json, error, created_at, updated_at, completed_at FROM agent_tool_calls WHERE channel_id = ? ORDER BY created_at").bind(channelId).all<ToolCallRow>();
    return rows.results.map(mapToolCall);
  }

  async listToolCallsForRun(runId: string): Promise<AgentToolCall[]> {
    const rows = await this.db.prepare("SELECT id, run_id, channel_id, tool_id, input_json, approval_id, status, result_json, error, created_at, updated_at, completed_at FROM agent_tool_calls WHERE run_id = ? ORDER BY created_at").bind(runId).all<ToolCallRow>();
    return rows.results.map(mapToolCall);
  }

  async getToolCall(id: string): Promise<AgentToolCall | undefined> {
    const row = await this.db.prepare("SELECT id, run_id, channel_id, tool_id, input_json, approval_id, status, result_json, error, created_at, updated_at, completed_at FROM agent_tool_calls WHERE id = ?").bind(id).first<ToolCallRow>();
    return row ? mapToolCall(row) : undefined;
  }

  async createToolCall(runId: string, channelId: string, toolId: string, input: unknown): Promise<AgentToolCall> {
    const id = crypto.randomUUID();
    const inputJson = JSON.stringify(input ?? null);
    await this.db.prepare("INSERT INTO agent_tool_calls (id, run_id, channel_id, tool_id, input_json, status) VALUES (?, ?, ?, ?, ?, 'pending')").bind(id, runId, channelId, toolId, inputJson).run();
    return { id, runId, channelId, toolId, input: input ?? null, approvalId: null, status: "pending", result: null, error: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null };
  }

  async markToolCallExecuting(id: string): Promise<void> {
    await this.db.prepare("UPDATE agent_tool_calls SET status = 'executing', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  }

  async markToolCallApprovalRequired(id: string, approvalId: string): Promise<void> {
    await this.db.prepare("UPDATE agent_tool_calls SET status = 'approval-required', approval_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(approvalId, id).run();
  }

  async markToolCallApproved(id: string): Promise<void> {
    await this.db.prepare("UPDATE agent_tool_calls SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
  }

  async markToolCallDenied(id: string, reason: string, result?: ToolExecutionResult): Promise<void> {
    await this.db.prepare("UPDATE agent_tool_calls SET status = 'denied', result_json = ?, error = ?, updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(result ? JSON.stringify(result) : null, reason, id).run();
  }

  async completeToolCall(id: string, result: ToolExecutionResult): Promise<void> {
    await this.db.prepare("UPDATE agent_tool_calls SET status = 'completed', result_json = ?, error = NULL, updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(JSON.stringify(result), id).run();
  }

  async failToolCall(id: string, message: string): Promise<void> {
    await this.db.prepare("UPDATE agent_tool_calls SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(message, id).run();
  }
}
