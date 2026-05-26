import { Hono } from "hono";
import { z } from "zod";
import { CloudflarePlatformClient, putDispatchWorker, sanitizeCloudflareError } from "@v2/cloudflare-platform";
import type { PlatformProvisionerEnv } from "./env";

const app = new Hono<{ Bindings: PlatformProvisionerEnv }>();

const resourceSchema = z.object({ kind: z.enum(["d1", "r2", "kv"]), binding: z.string().min(1), name: z.string().min(1) });
const provisionRuntimeSchema = z.object({
  workspaceId: z.string().min(1),
  pluginId: z.string().min(1),
  releaseId: z.string().min(1),
  version: z.string().min(1),
  resources: z.array(resourceSchema).default([]),
  workerScript: z.string().min(1).optional(),
});

function internalOnly(request: Request, env: PlatformProvisionerEnv) {
  const url = new URL(request.url);
  if (url.hostname === "platform-provisioner.internal") return true;
  const secret = request.headers.get("x-v2-provisioner-secret");
  return Boolean(env.INTERNAL_PROVISIONER_SECRET && secret && secret === env.INTERNAL_PROVISIONER_SECRET);
}

function safeRuntimeKey(workspaceId: string, pluginId: string) {
  return `${workspaceId}-${pluginId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 63);
}

app.get("/health", (c) => c.json({ ok: true, service: "platform-provisioner" }));

app.post("/internal/plugin-runtimes/provision", async (c) => {
  if (!internalOnly(c.req.raw, c.env)) return c.json({ status: "denied", error: "Provisioner access is internal only." }, 403);
  const input = provisionRuntimeSchema.parse(await c.req.json());
  const runtimeKey = safeRuntimeKey(input.workspaceId, input.pluginId);
  const plan = input.resources.map((resource) => ({ kind: resource.kind, binding: resource.binding, name: resource.name }));
  if (!c.env.CLOUDFLARE_ACCOUNT_ID || !c.env.CLOUDFLARE_API_TOKEN || !input.workerScript) {
    return c.json({ status: "planned", runtimeKey, runtimeKind: "dispatch-namespace", resources: plan, deploymentId: null, deployedVersion: input.version });
  }
  try {
    const client = new CloudflarePlatformClient({ accountId: c.env.CLOUDFLARE_ACCOUNT_ID, apiToken: c.env.CLOUDFLARE_API_TOKEN });
    const deployment = await putDispatchWorker(client, c.env.DISPATCH_NAMESPACE, runtimeKey, input.workerScript);
    return c.json({ status: "deployed", runtimeKey, runtimeKind: "dispatch-namespace", resources: plan, deploymentId: deployment.deploymentId, deployedVersion: input.version });
  } catch (error) {
    return c.json({ status: "failed", runtimeKey, runtimeKind: "dispatch-namespace", resources: plan, error: sanitizeCloudflareError(error) }, 502);
  }
});

export default app;
