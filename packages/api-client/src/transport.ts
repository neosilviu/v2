import { endpointByOperation, type ApiOperationId } from "@v2/api-contracts";
import { errorResponseSchema, type AppError } from "@v2/rpc-contracts";
import type { z } from "zod";

export type ApiClientConfig = {
  coreUrl: string;
  authUrl: string;
  fetch?: typeof fetch;
  getWorkspaceId?: () => string;
};

export class PlatformApiError<Code extends string = string> extends Error {
  constructor(readonly status: number, readonly operationId: string, readonly code: Code | undefined, message: string, readonly fieldErrors?: AppError["fieldErrors"]) {
    super(message);
    this.name = "PlatformApiError";
  }
}

export class CoreAuthRequiredError extends PlatformApiError<"not_authenticated"> {
  constructor(operationId: string) {
    super(401, operationId, "not_authenticated", "Authentication is required.");
    this.name = "CoreAuthRequiredError";
  }
}

export type ApiRequestInput = {
  params?: Record<string, string | number | boolean | undefined>;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
};

function encodePath(path: string, params: Record<string, string | number | boolean | undefined>) {
  return path.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`Missing path parameter: ${key}`);
    return encodeURIComponent(String(value));
  });
}

function appendQuery(url: URL, query: Record<string, string | number | boolean | undefined>) {
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
}

async function parseError(response: Response, operationId: string) {
  const text = await response.text().catch(() => "");
  if (!text) return new PlatformApiError(response.status, operationId, undefined, `API request failed: ${response.status}`);
  try {
    const payload = JSON.parse(text) as unknown;
    const parsed = errorResponseSchema.safeParse(payload);
    if (parsed.success) {
      return new PlatformApiError(response.status, operationId, parsed.data.error.code, parsed.data.error.message, parsed.data.error.fieldErrors);
    }
    const fallback = payload as { code?: unknown; error?: unknown; message?: unknown };
    const nested = typeof fallback.error === "object" && fallback.error ? fallback.error as { code?: unknown; message?: unknown } : null;
    const textError = typeof fallback.error === "string" ? fallback.error : undefined;
    const code = typeof fallback.code === "string" ? fallback.code : typeof nested?.code === "string" ? nested.code : textError;
    const message = typeof fallback.message === "string" ? fallback.message : typeof nested?.message === "string" ? nested.message : textError ?? `API request failed: ${response.status}`;
    return new PlatformApiError(response.status, operationId, code, message);
  } catch {
    return new PlatformApiError(response.status, operationId, undefined, text || `API request failed: ${response.status}`);
  }
}

export function createApiClient(config: ApiClientConfig) {
  const requester = config.fetch ?? fetch;
  async function request<Operation extends ApiOperationId>(operationId: Operation, input: ApiRequestInput = {}): Promise<unknown> {
    const endpoint = endpointByOperation(operationId);
    const params = endpoint.params.parse(input.params ?? {});
    const query = endpoint.query.parse(input.query ?? {});
    const method = endpoint.method;
    const body = endpoint.body.parse(input.body ?? {});
    const base = endpoint.service === "auth" ? config.authUrl : config.coreUrl;
    const url = new URL(encodePath(endpoint.path, params as Record<string, string | number | boolean | undefined>), base);
    appendQuery(url, query as Record<string, string | number | boolean | undefined>);
    const headers = new Headers();
    let requestBody: BodyInit | undefined;
    if (input.body instanceof FormData) {
      requestBody = input.body;
    } else if (method !== "GET" && method !== "HEAD" && input.body !== undefined) {
      headers.set("content-type", "application/json");
      requestBody = JSON.stringify(body);
    }
    const init: RequestInit = { method, credentials: "include", headers };
    if (requestBody !== undefined) init.body = requestBody;
    const response = await requester(url, init);
    if (response.status === 401) throw new CoreAuthRequiredError(operationId);
    if (!response.ok || !endpoint.successStatus.includes(response.status)) throw await parseError(response, operationId);
    if (response.status === 204) return undefined;
    const text = await response.text();
    const payload = text ? JSON.parse(text) : undefined;
    return endpoint.success.parse(payload) as z.output<typeof endpoint.success>;
  }
  return { request };
}
