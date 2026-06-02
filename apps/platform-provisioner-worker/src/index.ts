import { Hono } from "hono";
import { z } from "zod";
import {
  CloudflarePlatformClient,
  createD1Database,
  createKvNamespace,
  createR2Bucket,
  deleteDispatchWorker,
  putDispatchWorker,
  sanitizeCloudflareError,
} from "@v2/cloudflare-platform";
import type { PlatformProvisionerEnv } from "./env";

const app = new Hono<{ Bindings: PlatformProvisionerEnv }>();

const resourceSchema = z.object({
  kind: z.enum(["d1", "r2", "kv"]),
  binding: z.string().min(1),
  name: z.string().min(1),
});
const provisionRuntimeSchema = z.object({
  workspaceId: z.string().min(1),
  pluginId: z.string().min(1),
  releaseId: z.string().min(1),
  version: z.string().min(1),
  resources: z.array(resourceSchema).default([]),
  packageSha256: z.string().length(64).optional(),
  worker: z
    .object({
      entry: z.string().optional(),
      isolation: z.enum(["none", "platform-worker"]).default("none"),
    })
    .optional(),
  workerScript: z.string().min(1).optional(),
});
const runtimeKeySchema = z.object({ runtimeKey: z.string().min(1) });
const rollbackRuntimeSchema = z.object({
  workerScript: z.string().min(1),
  deployedVersion: z.string().min(1).optional(),
});

function internalOnly(request: Request, env: PlatformProvisionerEnv) {
  const url = new URL(request.url);
  if (url.hostname === "platform-provisioner.internal") return true;
  const secret = request.headers.get("x-v2-provisioner-secret");
  return Boolean(
    env.INTERNAL_PROVISIONER_SECRET &&
    secret &&
    secret === env.INTERNAL_PROVISIONER_SECRET,
  );
}

function safeRuntimeKey(workspaceId: string, pluginId: string) {
  return `${workspaceId}-${pluginId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

function cloudflareClient(env: PlatformProvisionerEnv) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) return undefined;
  return new CloudflarePlatformClient({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
  });
}

async function ensureResource(
  client: CloudflarePlatformClient,
  resource: z.output<typeof resourceSchema>,
) {
  try {
    if (resource.kind === "d1") {
      const database = await createD1Database(client, resource.name);
      return {
        kind: resource.kind,
        binding: resource.binding,
        name: resource.name,
        status: "created",
        id: database.uuid,
      };
    }
    if (resource.kind === "r2") {
      const bucket = await createR2Bucket(client, resource.name);
      return {
        kind: resource.kind,
        binding: resource.binding,
        name: bucket.name,
        status: "created",
      };
    }
    const namespace = await createKvNamespace(client, resource.name);
    return {
      kind: resource.kind,
      binding: resource.binding,
      name: namespace.title,
      status: "created",
      id: namespace.id,
    };
  } catch (error) {
    const safe = sanitizeCloudflareError(error);
    if (/already exists|already owned|duplicate/i.test(safe.message)) {
      return {
        kind: resource.kind,
        binding: resource.binding,
        name: resource.name,
        status: "ensured",
      };
    }
    throw error;
  }
}

app.get("/health", (c) =>
  c.json({ ok: true, service: "platform-provisioner" }),
);

app.post("/internal/plugin-runtimes/provision", async (c) => {
  if (!internalOnly(c.req.raw, c.env))
    return c.json(
      { status: "denied", error: "Provisioner access is internal only." },
      403,
    );
  const input = provisionRuntimeSchema.parse(await c.req.json());
  const runtimeKey = safeRuntimeKey(input.workspaceId, input.pluginId);
  const plan = input.resources.map((resource) => ({
    kind: resource.kind,
    binding: resource.binding,
    name: resource.name,
  }));
  if (c.env.ENVIRONMENT !== "production") {
    return c.json({
      status: "deployed",
      runtimeKey: input.pluginId,
      runtimeKind: "local-dev",
      resources: plan.map((resource) => ({
        ...resource,
        status: "planned-local",
      })),
      deploymentId: `local-dev:${input.workspaceId}:${input.pluginId}:${input.releaseId}`,
      deployedVersion: input.version,
    });
  }
  const client = cloudflareClient(c.env);
  if (!client) {
    return c.json(
      {
        status: "failed",
        runtimeKey,
        runtimeKind: "dispatch-namespace",
        resources: plan,
        error: {
          code: "missing_cloudflare_credentials",
          message: "Cloudflare provisioning credentials are not configured.",
          retryable: true,
        },
      },
      503,
    );
  }
  if (!input.workerScript || input.worker?.isolation !== "platform-worker") {
    return c.json(
      {
        status: "failed",
        runtimeKey,
        runtimeKind: "dispatch-namespace",
        resources: plan,
        error: {
          code: "missing_verified_worker_script",
          message:
            "A verified platform Worker script is required for production runtime deployment.",
          retryable: false,
        },
      },
      400,
    );
  }
  try {
    const resources = [];
    for (const resource of input.resources)
      resources.push(await ensureResource(client, resource));
    const deployment = await putDispatchWorker(
      client,
      c.env.DISPATCH_NAMESPACE,
      runtimeKey,
      input.workerScript,
    );
    return c.json({
      status: "deployed",
      runtimeKey,
      runtimeKind: "dispatch-namespace",
      resources,
      deploymentId: deployment.deploymentId,
      deployedVersion: input.version,
    });
  } catch (error) {
    return c.json(
      {
        status: "failed",
        runtimeKey,
        runtimeKind: "dispatch-namespace",
        resources: plan,
        error: sanitizeCloudflareError(error),
      },
      502,
    );
  }
});

app.post("/internal/plugin-runtimes/:runtimeKey/deactivate", async (c) => {
  if (!internalOnly(c.req.raw, c.env))
    return c.json(
      { status: "denied", error: "Provisioner access is internal only." },
      403,
    );
  const { runtimeKey } = runtimeKeySchema.parse({
    runtimeKey: c.req.param("runtimeKey"),
  });
  if (c.env.ENVIRONMENT !== "production")
    return c.json({ status: "disabled", runtimeKey, runtimeKind: "local-dev" });
  return c.json({
    status: "disabled",
    runtimeKey,
    runtimeKind: "dispatch-namespace",
  });
});

app.post("/internal/plugin-runtimes/:runtimeKey/delete", async (c) => {
  if (!internalOnly(c.req.raw, c.env))
    return c.json(
      { status: "denied", error: "Provisioner access is internal only." },
      403,
    );
  const { runtimeKey } = runtimeKeySchema.parse({
    runtimeKey: c.req.param("runtimeKey"),
  });
  if (c.env.ENVIRONMENT !== "production")
    return c.json({ status: "deleted", runtimeKey, runtimeKind: "local-dev" });
  const client = cloudflareClient(c.env);
  if (!client)
    return c.json(
      {
        status: "failed",
        runtimeKey,
        runtimeKind: "dispatch-namespace",
        error: {
          code: "missing_cloudflare_credentials",
          message: "Cloudflare provisioning credentials are not configured.",
          retryable: true,
        },
      },
      503,
    );
  try {
    await deleteDispatchWorker(client, c.env.DISPATCH_NAMESPACE, runtimeKey);
    return c.json({
      status: "deleted",
      runtimeKey,
      runtimeKind: "dispatch-namespace",
    });
  } catch (error) {
    return c.json(
      {
        status: "failed",
        runtimeKey,
        runtimeKind: "dispatch-namespace",
        error: sanitizeCloudflareError(error),
      },
      502,
    );
  }
});

app.post("/internal/plugin-runtimes/:runtimeKey/rollback", async (c) => {
  if (!internalOnly(c.req.raw, c.env))
    return c.json(
      { status: "denied", error: "Provisioner access is internal only." },
      403,
    );
  const { runtimeKey } = runtimeKeySchema.parse({
    runtimeKey: c.req.param("runtimeKey"),
  });
  const input = rollbackRuntimeSchema.parse(await c.req.json());
  if (c.env.ENVIRONMENT !== "production")
    return c.json({
      status: "deployed",
      runtimeKey,
      runtimeKind: "local-dev",
      deploymentId: `local-dev:rollback:${runtimeKey}`,
      deployedVersion: input.deployedVersion ?? "rollback",
    });
  const client = cloudflareClient(c.env);
  if (!client)
    return c.json(
      {
        status: "failed",
        runtimeKey,
        runtimeKind: "dispatch-namespace",
        error: {
          code: "missing_cloudflare_credentials",
          message: "Cloudflare provisioning credentials are not configured.",
          retryable: true,
        },
      },
      503,
    );
  try {
    const deployment = await putDispatchWorker(
      client,
      c.env.DISPATCH_NAMESPACE,
      runtimeKey,
      input.workerScript,
    );
    return c.json({
      status: "deployed",
      runtimeKey,
      runtimeKind: "dispatch-namespace",
      deploymentId: deployment.deploymentId,
      deployedVersion: input.deployedVersion ?? "rollback",
    });
  } catch (error) {
    return c.json(
      {
        status: "failed",
        runtimeKey,
        runtimeKind: "dispatch-namespace",
        error: sanitizeCloudflareError(error),
      },
      502,
    );
  }
});

export default app;
