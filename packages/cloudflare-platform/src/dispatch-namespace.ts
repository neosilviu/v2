import type { CloudflarePlatformClient } from "./client";

export type DispatchDeployment = { runtimeKey: string; deploymentId: string; status: "deployed" | "failed" };

export async function putDispatchWorker(client: CloudflarePlatformClient, namespace: string, runtimeKey: string, workerScript: string | ArrayBuffer) {
  const result = await client.request<{ id: string }>(client.accountPath(`/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(runtimeKey)}`), {
    method: "PUT",
    headers: { "content-type": "application/javascript" },
    body: workerScript,
  });
  return { runtimeKey, deploymentId: result.id, status: "deployed" as const } satisfies DispatchDeployment;
}

export async function deleteDispatchWorker(client: CloudflarePlatformClient, namespace: string, runtimeKey: string) {
  await client.request<unknown>(client.accountPath(`/workers/dispatch/namespaces/${encodeURIComponent(namespace)}/scripts/${encodeURIComponent(runtimeKey)}`), { method: "DELETE" });
  return { runtimeKey, status: "deleted" as const };
}
