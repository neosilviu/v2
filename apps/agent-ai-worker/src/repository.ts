import type { AgentChannel, AgentMessage, AgentProviderBinding, AgentRun } from "@v2/agent-contracts";

export class AgentRepository {
  constructor(private readonly db: D1Database) {}

  async ensureDefaultChannel(workspaceId: string): Promise<void> {
    await this.db.prepare("INSERT OR IGNORE INTO agent_channels (id, workspace_id, title) VALUES (?, ?, ?)")
      .bind(`${workspaceId}.general`, workspaceId, "General").run();
  }

  async listChannels(workspaceId: string): Promise<AgentChannel[]> {
    await this.ensureDefaultChannel(workspaceId);
    const rows = await this.db.prepare("SELECT id, workspace_id, title, provider_id, created_at FROM agent_channels WHERE workspace_id = ? ORDER BY created_at")
      .bind(workspaceId).all<{ id: string; workspace_id: string; title: string; provider_id: string | null; created_at: string }>();
    return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, title: row.title, providerId: row.provider_id, createdAt: row.created_at }));
  }

  async createChannel(workspaceId: string, title: string, providerId: string | null): Promise<AgentChannel> {
    const id = `${workspaceId}.${crypto.randomUUID()}`;
    await this.db.prepare("INSERT INTO agent_channels (id, workspace_id, title, provider_id) VALUES (?, ?, ?, ?)")
      .bind(id, workspaceId, title, providerId).run();
    return { id, workspaceId, title, providerId, createdAt: new Date().toISOString() };
  }

  async setChannelProvider(channelId: string, providerId: string | null) {
    await this.db.prepare("UPDATE agent_channels SET provider_id = ? WHERE id = ?").bind(providerId, channelId).run();
  }

  async listProviders(workspaceId: string): Promise<AgentProviderBinding[]> {
    const rows = await this.db.prepare("SELECT id, workspace_id, contribution_id, title, model, status, created_at FROM agent_provider_bindings WHERE workspace_id = ? ORDER BY created_at")
      .bind(workspaceId).all<{ id: string; workspace_id: string; contribution_id: string; title: string; model: string; status: AgentProviderBinding["status"]; created_at: string }>();
    return rows.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id, contributionId: row.contribution_id, title: row.title, model: row.model, status: row.status, createdAt: row.created_at }));
  }

  async createProvider(workspaceId: string, contributionId: string, title: string, model: string): Promise<AgentProviderBinding> {
    const id = `${workspaceId}.${crypto.randomUUID()}`;
    const status = "missing-secret" as const;
    await this.db.prepare("INSERT INTO agent_provider_bindings (id, workspace_id, contribution_id, title, model, status) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, workspaceId, contributionId, title, model, status).run();
    return { id, workspaceId, contributionId, title, model, status, createdAt: new Date().toISOString() };
  }

  async listMessages(channelId: string): Promise<AgentMessage[]> {
    const rows = await this.db.prepare("SELECT id, channel_id, role, content, created_at FROM agent_messages WHERE channel_id = ? ORDER BY created_at")
      .bind(channelId).all<{ id: string; channel_id: string; role: AgentMessage["role"]; content: string; created_at: string }>();
    return rows.results.map((row) => ({ id: row.id, channelId: row.channel_id, role: row.role, content: row.content, createdAt: row.created_at }));
  }

  async addMessage(channelId: string, role: AgentMessage["role"], content: string): Promise<AgentMessage> {
    const id = crypto.randomUUID();
    await this.db.prepare("INSERT INTO agent_messages (id, channel_id, role, content) VALUES (?, ?, ?, ?)").bind(id, channelId, role, content).run();
    return { id, channelId, role, content, createdAt: new Date().toISOString() };
  }

  async createRun(channelId: string, providerId: string | null): Promise<AgentRun> {
    const id = crypto.randomUUID();
    const status = providerId ? "queued" as const : "provider-required" as const;
    await this.db.prepare("INSERT INTO agent_runs (id, channel_id, provider_id, status) VALUES (?, ?, ?, ?)").bind(id, channelId, providerId, status).run();
    return { id, channelId, providerId, status, createdAt: new Date().toISOString() };
  }
}
