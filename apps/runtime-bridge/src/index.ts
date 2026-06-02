import { Hono } from "hono";
import type { BridgeEnv } from "./env";

const app = new Hono<{ Bindings: BridgeEnv }>();

type DispatchRequest = {
  runtimeKey?: unknown;
  pluginId?: unknown;
  workspaceId?: unknown;
  kind?: unknown;
  operationId?: unknown;
  contributionId?: unknown;
  input?: unknown;
  routeParams?: unknown;
  queryParams?: unknown;
};

function runtimeUnavailable(
  message = "Plugin runtime is not deployed in the dispatch namespace.",
) {
  return { status: "unavailable" as const, error: message };
}

function isInternalDispatchRequest(request: Request) {
  const url = new URL(request.url);
  return (
    url.hostname === "plugin-runtime.internal" ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  );
}

async function dispatchToLocalRuntime(
  env: BridgeEnv,
  body: Required<
    Pick<DispatchRequest, "workspaceId" | "kind" | "operationId">
  > &
    DispatchRequest,
) {
  if (!env.PLUGIN_RUNTIME_LOCAL_ORIGIN) return null;
  const upstream = new URL(env.PLUGIN_RUNTIME_LOCAL_ORIGIN);
  const request = new Request(`${upstream.origin}/runtime/execute`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-v2-runtime-bridge-dev": "1",
    },
    body: JSON.stringify({
      workspaceId: body.workspaceId,
      kind: body.kind,
      operationId: body.operationId,
      contributionId: body.contributionId,
      input: body.input,
      routeParams: body.routeParams,
      queryParams: body.queryParams,
    }),
  });
  return fetch(request);
}

app.get("/health", (c) => c.json({ ok: true, service: "runtime-bridge" }));

app.post("/dispatch", async (c) => {
  if (!isInternalDispatchRequest(c.req.raw))
    return c.json(
      { status: "denied", error: "Runtime dispatch is internal only." },
      403,
    );
  const body = (await c.req.json().catch(() => null)) as DispatchRequest | null;
  const runtimeKey =
    typeof body?.runtimeKey === "string" ? body.runtimeKey : "";
  const pluginId = typeof body?.pluginId === "string" ? body.pluginId : "";
  const workspaceId =
    typeof body?.workspaceId === "string" ? body.workspaceId : "";
  const operationId =
    typeof body?.operationId === "string" ? body.operationId : "";
  const kind =
    body?.kind === "tool" ||
    body?.kind === "action" ||
    body?.kind === "data" ||
    body?.kind === "operation"
      ? body.kind
      : "";
  if (!runtimeKey || !pluginId || !workspaceId || !operationId || !kind) {
    return c.json(
      {
        status: "denied",
        error: "A valid plugin runtime dispatch request is required.",
      },
      400,
    );
  }
  const dispatch = body ?? {};

  let runtime: Fetcher | undefined;
  try {
    runtime = c.env.DISPATCHER?.get(runtimeKey);
  } catch {
    runtime = undefined;
  }
  let response: Response | null = null;
  if (runtime) {
    try {
      response = await runtime.fetch(
        "https://plugin-runtime.internal/runtime/execute",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            kind,
            operationId,
            contributionId: dispatch.contributionId,
            input: dispatch.input,
            routeParams: dispatch.routeParams,
            queryParams: dispatch.queryParams,
          }),
        },
      );
    } catch {
      response = null;
    }
  }
  response ??= await dispatchToLocalRuntime(c.env, {
    ...dispatch,
    workspaceId,
    kind,
    operationId,
  });

  if (!response) return c.json(runtimeUnavailable(), 501);
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

export default app;
