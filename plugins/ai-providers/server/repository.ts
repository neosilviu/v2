import type { ProviderModel } from "@v2/plugin-contracts";
export type ProviderConnection = { id: string; workspaceId: string; providerId: string; title: string; status: "configured" | "unavailable" | "disabled"; defaultModelId: string | null };
export class ProviderRepository {
  constructor(private readonly db: D1Database) {}
  async get(connectionId: string): Promise<ProviderConnection | undefined> {
    const row = await this.db.prepare("SELECT id, workspace_id, provider_id, title, status, default_model_id FROM provider_connections WHERE id = ?").bind(connectionId).first<{ id: string; workspace_id: string; provider_id: string; title: string; status: ProviderConnection["status"]; default_model_id: string | null }>();
    return row ? { id: row.id, workspaceId: row.workspace_id, providerId: row.provider_id, title: row.title, status: row.status, defaultModelId: row.default_model_id } : undefined;
  }
  async replaceModels(connectionId: string, models: ProviderModel[]) {
    await this.db.batch([this.db.prepare("DELETE FROM provider_model_snapshots WHERE connection_id = ?").bind(connectionId), ...models.map((model) => this.db.prepare("INSERT INTO provider_model_snapshots (id, connection_id, model_id, title, capabilities_json) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), connectionId, model.id, model.title, JSON.stringify(model.capabilities)))]);
  }
}
