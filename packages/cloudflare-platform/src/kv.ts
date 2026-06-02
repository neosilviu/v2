import type { CloudflarePlatformClient } from "./client";

export type KvPlan = { binding: string; namespaceTitle: string };

export async function createKvNamespace(
  client: CloudflarePlatformClient,
  title: string,
) {
  return client.request<{ id: string; title: string }>(
    client.accountPath("/storage/kv/namespaces"),
    { method: "POST", body: JSON.stringify({ title }) },
  );
}
