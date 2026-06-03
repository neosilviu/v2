import type { CloudflarePlatformClient } from "./client";

export type CloudflareAccount = { id: string; name: string };

export async function getAccount(client: CloudflarePlatformClient) {
  return client.request<CloudflareAccount>(client.accountPath(""));
}
