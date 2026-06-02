import type { CloudflarePlatformClient } from "./client";

export type R2Plan = { binding: string; bucketName: string };

export async function createR2Bucket(
  client: CloudflarePlatformClient,
  bucketName: string,
) {
  await client.request<unknown>(
    client.accountPath(`/r2/buckets/${encodeURIComponent(bucketName)}`),
    { method: "PUT" },
  );
  return { name: bucketName };
}
