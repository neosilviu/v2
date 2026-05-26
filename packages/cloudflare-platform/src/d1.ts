import type { CloudflarePlatformClient } from "./client";

export type D1Plan = { binding: string; databaseName: string };
export type D1DatabaseMetadata = { uuid: string; name: string };

export async function createD1Database(client: CloudflarePlatformClient, name: string) {
  return client.request<D1DatabaseMetadata>(client.accountPath("/d1/database"), { method: "POST", body: JSON.stringify({ name }) });
}
