import type { CloudflarePlatformClient } from "./client";

export type DnsRecordInput = { zoneId: string; type: "TXT" | "CNAME"; name: string; content: string; ttl?: number };

export async function createDnsRecord(client: CloudflarePlatformClient, input: DnsRecordInput) {
  return client.request<{ id: string; type: string; name: string }>(`/zones/${encodeURIComponent(input.zoneId)}/dns_records`, {
    method: "POST",
    body: JSON.stringify({ type: input.type, name: input.name, content: input.content, ttl: input.ttl ?? 300 }),
  });
}
