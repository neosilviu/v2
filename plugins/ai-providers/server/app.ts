import { Hono } from "hono";
import { cors } from "hono/cors";
import { errorResponse, failure } from "@v2/feedback-runtime";
import {
  createWorkersAiConnectionSchema,
  providerChatRequestSchema,
} from "@v2/provider-contracts";
import { aiProvidersPlugin } from "../manifest";
import {
  allowedOrigins,
  isInternalRequest,
  readSession,
  type ProviderAccessEnv,
} from "./access";
import {
  detectProviderModels,
  invokeProviderChat,
  testProvider,
  type ProviderRuntimeEnv,
} from "./adapters/runtime";
import { ProviderRepository } from "./repository";

type ProviderServiceEnv = ProviderRuntimeEnv &
  ProviderAccessEnv & { PROVIDERS_DB?: D1Database };
let app = new Hono<{ Bindings: ProviderServiceEnv }>();
const catalog = new Map(
  aiProvidersPlugin.contributes.providers.map((provider) => [
    provider.id,
    provider,
  ]),
);
const providers = [...catalog.values()].map((provider) => ({
  id: provider.id,
  title: provider.title,
  externalConfigurationRequired: provider.adapter !== "cloudflare-workers-ai",
}));
const unavailable = (message: string) =>
  errorResponse(failure("dependency_unavailable", message));
const repository = (env: ProviderServiceEnv) =>
  env.PROVIDERS_DB ? new ProviderRepository(env.PROVIDERS_DB) : null;
async function resolved(env: ProviderServiceEnv, connectionId: string) {
  const repo = repository(env);
  if (!repo)
    return {
      error: unavailable("Provider connection storage is not configured."),
      status: 503 as const,
    };
  const connection = await repo.get(connectionId);
  if (!connection)
    return {
      error: errorResponse(
        failure("not_found", "Provider connection is not available."),
      ),
      status: 404 as const,
    };
  if (connection.status === "disabled")
    return {
      error: errorResponse(
        failure("conflict", "Provider connection is disabled."),
      ),
      status: 409 as const,
    };
  const provider = catalog.get(connection.providerId);
  if (!provider)
    return {
      error: errorResponse(
        failure("not_found", "Provider definition is not available."),
      ),
      status: 404 as const,
    };
  return { repo, connection, provider };
}
app = app.use(
  "*",
  cors({
    origin: (origin, c) =>
      allowedOrigins(c.env).includes(origin) ? origin : "",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    maxAge: 600,
  }),
);
app = app.use("/manage/*", async (c, next) =>
  (await readSession(c.env, c.req.raw.headers))
    ? next()
    : c.json(
        errorResponse(
          failure("not_authenticated", "Authentication is required."),
        ),
        401,
      ),
);
app = app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "ai-providers",
    storageConfigured: Boolean(c.env.PROVIDERS_DB),
    workersAiConfigured: Boolean(c.env.AI),
  }),
);
app = app.get("/providers", (c) => c.json({ providers }));
app = app.get("/manage/connections", async (c) => {
  const repo = repository(c.env);
  if (!repo)
    return c.json(
      unavailable("Provider connection storage is not configured."),
      503,
    );
  return c.json({
    connections: await repo.list(c.req.query("workspaceId") ?? "default"),
  });
});
app = app.post("/manage/connections/workers-ai", async (c) => {
  const repo = repository(c.env);
  if (!repo)
    return c.json(
      unavailable("Provider connection storage is not configured."),
      503,
    );
  const input = createWorkersAiConnectionSchema.parse(await c.req.json());
  return c.json(
    {
      connection: await repo.createWorkersAi(
        input.workspaceId,
        input.title,
        input.modelId,
        Boolean(c.env.AI),
      ),
    },
    201,
  );
});
app = app.get("/connections", async (c) => {
  if (!isInternalRequest(c.req.raw))
    return c.json(
      errorResponse(
        failure("not_authorized", "Provider runtime access is internal only."),
      ),
      403,
    );
  const repo = repository(c.env);
  if (!repo)
    return c.json(
      unavailable("Provider connection storage is not configured."),
      503,
    );
  return c.json({
    connections: await repo.list(c.req.query("workspaceId") ?? "default"),
  });
});
app = app.use("/connections/*", async (c, next) =>
  isInternalRequest(c.req.raw)
    ? next()
    : c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Provider operations require an internal runtime request.",
          ),
        ),
        403,
      ),
);
app = app.post("/connections/:connectionId/detect-models", async (c) => {
  const result = await resolved(c.env, c.req.param("connectionId"));
  if ("error" in result) return c.json(result.error, result.status);
  try {
    const models = await detectProviderModels(c.env, result.provider, {});
    await result.repo.replaceModels(result.connection.id, models);
    return c.json({ models });
  } catch {
    return c.json(unavailable("Provider model discovery failed."), 502);
  }
});
app = app.post("/connections/:connectionId/test", async (c) => {
  const result = await resolved(c.env, c.req.param("connectionId"));
  if ("error" in result) return c.json(result.error, result.status);
  const input = await c.req.json<{ modelId?: string }>();
  try {
    return c.json(
      await testProvider(
        c.env,
        result.provider,
        {},
        input.modelId ?? result.connection.defaultModelId ?? undefined,
      ),
    );
  } catch {
    return c.json(unavailable("Provider connection test failed."), 502);
  }
});
app = app.post("/connections/:connectionId/chat", async (c) => {
  const result = await resolved(c.env, c.req.param("connectionId"));
  if ("error" in result) return c.json(result.error, result.status);
  const input = providerChatRequestSchema.parse(await c.req.json());
  const modelId = input.modelId ?? result.connection.defaultModelId;
  if (!modelId)
    return c.json(
      errorResponse(
        failure("conflict", "No chat model is configured for this connection."),
      ),
      409,
    );
  try {
    return c.json(
      await invokeProviderChat(c.env, result.provider, modelId, input.messages),
    );
  } catch {
    return c.json(
      unavailable(
        "Provider chat execution is not available for this connection.",
      ),
      502,
    );
  }
});
app = app.post("/runtime/execute", async (c) => {
  if (
    !isInternalRequest(c.req.raw) &&
    new URL(c.req.url).hostname !== "plugin-runtime.internal"
  )
    return c.json(
      errorResponse(
        failure("not_authorized", "Provider runtime access is internal only."),
      ),
      403,
    );
  const body = (await c.req.json().catch(() => null)) as {
    workspaceId?: unknown;
    operationId?: unknown;
    input?: unknown;
  } | null;
  const operationId =
    typeof body?.operationId === "string" ? body.operationId : "";
  const input =
    body?.input && typeof body.input === "object"
      ? (body.input as Record<string, unknown>)
      : {};
  const repo = repository(c.env);
  if (!repo)
    return c.json(
      unavailable("Provider connection storage is not configured."),
      503,
    );
  if (operationId === "providers.listConnections")
    return c.json({
      connections: await repo.list(
        typeof body?.workspaceId === "string" ? body.workspaceId : "default",
      ),
    });
  if (operationId === "providers.addWorkersAiConnection") {
    const payload = createWorkersAiConnectionSchema.parse({
      workspaceId: body?.workspaceId,
      title: typeof input.title === "string" ? input.title : "",
      modelId: typeof input.modelId === "string" ? input.modelId : undefined,
    });
    return c.json(
      {
        connection: await repo.createWorkersAi(
          payload.workspaceId,
          payload.title,
          payload.modelId,
          Boolean(c.env.AI),
        ),
      },
      201,
    );
  }
  const connectionId =
    typeof input.connectionId === "string" ? input.connectionId : "";
  if (!connectionId && operationId === "providers.detectModels") {
    return c.json({
      rows: aiProvidersPlugin.contributes.providers.map((provider) => ({
        provider: provider.title,
        adapter: provider.adapter,
        status:
          provider.adapter === "cloudflare-workers-ai"
            ? "enabled"
            : "server-configured",
      })),
    });
  }
  if (!connectionId)
    return c.json(
      errorResponse(failure("validation_failed", "connectionId is required.")),
      400,
    );
  const result = await resolved(c.env, connectionId);
  if ("error" in result) return c.json(result.error, result.status);
  if (operationId === "providers.detectModels") {
    try {
      const models = await detectProviderModels(c.env, result.provider, {});
      await result.repo.replaceModels(result.connection.id, models);
      return c.json({ models });
    } catch {
      return c.json(unavailable("Provider model discovery failed."), 502);
    }
  }
  if (operationId === "providers.testConnection") {
    try {
      return c.json(
        await testProvider(
          c.env,
          result.provider,
          {},
          typeof input.modelId === "string"
            ? input.modelId
            : (result.connection.defaultModelId ?? undefined),
        ),
      );
    } catch {
      return c.json(unavailable("Provider connection test failed."), 502);
    }
  }
  if (operationId === "providers.chat") {
    const request = providerChatRequestSchema.parse({
      modelId: input.modelId,
      messages: input.messages,
    });
    const modelId = request.modelId ?? result.connection.defaultModelId;
    if (!modelId)
      return c.json(
        errorResponse(
          failure(
            "conflict",
            "No chat model is configured for this connection.",
          ),
        ),
        409,
      );
    try {
      return c.json(
        await invokeProviderChat(
          c.env,
          result.provider,
          modelId,
          request.messages,
        ),
      );
    } catch {
      return c.json(
        unavailable(
          "Provider chat execution is not available for this connection.",
        ),
        502,
      );
    }
  }
  return c.json(
    errorResponse(
      failure("not_found", "Provider runtime operation is not available."),
    ),
    404,
  );
});
export default app;
export type AiProvidersApi = typeof app;
