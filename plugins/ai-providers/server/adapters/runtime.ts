import type { Ai } from "@cloudflare/workers-types";
import type { ProviderContribution, ProviderModel } from "@v2/plugin-contracts";
import type {
  ProviderChatMessage,
  ProviderChatResult,
} from "@v2/provider-contracts";

export type ProviderRuntimeEnv = {
  AI?: Ai;
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_BASE_URL?: string;
};
export type ProviderCredentials = Record<string, string>;
type AiRunner = {
  run(
    model: string,
    input: { messages: ProviderChatMessage[] },
  ): Promise<unknown>;
};
const fallback = (provider: ProviderContribution) => provider.models;
const gateway = (
  env: ProviderRuntimeEnv,
  slug: string,
  direct: string,
  suffix: string,
) =>
  env.CLOUDFLARE_ACCOUNT_ID && env.AI_GATEWAY_ID
    ? `${(env.AI_GATEWAY_BASE_URL ?? "https://gateway.ai.cloudflare.com/v1").replace(/\/$/, "")}/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/${slug}${suffix}`
    : direct;
const secret = (credentials: ProviderCredentials, key = "api_key") => {
  const value = credentials[key]?.trim();
  if (!value) throw new Error("Provider configuration is unavailable.");
  return value;
};

function normalizeModels(
  provider: ProviderContribution,
  payload: unknown,
): ProviderModel[] {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(root.data)
      ? root.data
      : Array.isArray(root.models)
        ? root.models
        : Array.isArray(root.result)
          ? root.result
          : [];
  const models = new Map<string, ProviderModel>();
  for (const row of rows) {
    const item =
      typeof row === "string"
        ? { id: row }
        : row && typeof row === "object"
          ? (row as Record<string, unknown>)
          : {};
    let id = String(item.id ?? item.name ?? item.model ?? "").trim();
    if (provider.adapter === "gemini") id = id.replace(/^models\//, "");
    const methods = Array.isArray(item.supportedGenerationMethods)
      ? item.supportedGenerationMethods.map(String)
      : [];
    if (
      !id ||
      (provider.adapter === "gemini" &&
        methods.length > 0 &&
        !methods.includes("generateContent"))
    )
      continue;
    if (!models.has(id))
      models.set(id, {
        id,
        title: String(item.displayName ?? item.label ?? id),
        capabilities: ["chat"],
      });
  }
  return [...models.values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}
async function parseModels(provider: ProviderContribution, response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(`Model discovery failed with status ${response.status}.`);
  const models = normalizeModels(provider, payload);
  return models.length > 0 ? models : fallback(provider);
}
export async function detectProviderModels(
  env: ProviderRuntimeEnv,
  provider: ProviderContribution,
  credentials: ProviderCredentials,
): Promise<ProviderModel[]> {
  switch (provider.adapter) {
    case "cloudflare-workers-ai": {
      if (env.AI) {
        const models = normalizeModels(provider, await env.AI.models());
        if (models.length > 0) return models;
      }
      const token = credentials.api_token?.trim();
      const accountId =
        credentials.account_id?.trim() || env.CLOUDFLARE_ACCOUNT_ID;
      if (!token || !accountId) return fallback(provider);
      return parseModels(
        provider,
        await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?per_page=100`,
          { headers: { authorization: `Bearer ${token}` } },
        ),
      );
    }
    case "openai":
      return parseModels(
        provider,
        await fetch(
          gateway(env, "openai", "https://api.openai.com/v1/models", "/models"),
          { headers: { authorization: `Bearer ${secret(credentials)}` } },
        ),
      );
    case "groq":
      return parseModels(
        provider,
        await fetch(
          gateway(
            env,
            "groq",
            "https://api.groq.com/openai/v1/models",
            "/openai/v1/models",
          ),
          { headers: { authorization: `Bearer ${secret(credentials)}` } },
        ),
      );
    case "github-models":
      return parseModels(
        provider,
        await fetch(
          gateway(
            env,
            "github",
            "https://models.github.ai/catalog/models",
            "/catalog/models",
          ),
          {
            headers: {
              authorization: `Bearer ${secret(credentials, "token")}`,
            },
          },
        ),
      );
    case "gemini":
      return parseModels(
        provider,
        await fetch(
          gateway(
            env,
            "google-ai-studio",
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(secret(credentials))}`,
            `/v1beta/models?key=${encodeURIComponent(secret(credentials))}`,
          ),
        ),
      );
    case "openai-compatible":
      throw new Error(
        "Custom compatible providers must contribute a discovery adapter.",
      );
  }
}
export async function testProvider(
  env: ProviderRuntimeEnv,
  provider: ProviderContribution,
  credentials: ProviderCredentials,
  modelId?: string,
) {
  const startedAt = Date.now();
  const models = await detectProviderModels(env, provider, credentials);
  const model = modelId ?? models[0]?.id;
  if (!model) throw new Error("No model detected for provider.");
  return {
    ok: true,
    providerId: provider.id,
    modelId: model,
    detectedModels: models.length,
    latencyMs: Date.now() - startedAt,
  };
}
export async function invokeProviderChat(
  env: ProviderRuntimeEnv,
  provider: ProviderContribution,
  modelId: string,
  messages: ProviderChatMessage[],
): Promise<ProviderChatResult> {
  if (provider.adapter !== "cloudflare-workers-ai" || !env.AI)
    throw new Error(
      "This provider requires a configured server-side execution adapter.",
    );
  const output = await (env.AI as unknown as AiRunner).run(modelId, {
    messages,
  });
  const root =
    output && typeof output === "object"
      ? (output as Record<string, unknown>)
      : {};
  const content =
    typeof root.response === "string"
      ? root.response
      : typeof root.result === "string"
        ? root.result
        : "";
  if (!content) throw new Error("Provider returned no assistant text.");
  return { providerId: provider.id, modelId, content };
}
