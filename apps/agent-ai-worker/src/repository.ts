import type { AgentChannel, AgentMessage } from "@v2/agent-contracts";

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
    const now = new Date().toISOString();
    return { id, workspaceId, title, providerId, createdAt: now };
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
}
