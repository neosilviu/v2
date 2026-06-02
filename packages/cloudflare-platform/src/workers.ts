import type { CloudflarePlatformClient } from "./client";

export type WorkerDeploymentStatus = {
  id: string;
  status: "deployed" | "failed" | "unknown";
};

export async function getWorkerDeployment(
  client: CloudflarePlatformClient,
  scriptName: string,
) {
  return client.request<WorkerDeploymentStatus>(
    client.accountPath(
      `/workers/scripts/${encodeURIComponent(scriptName)}/deployments`,
    ),
  );
}
