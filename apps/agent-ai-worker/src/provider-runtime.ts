import type { Ai } from "@cloudflare/workers-types";
import type { ProviderContribution, ProviderModel } from "@v2/plugin-contracts";

export type ProviderRuntimeEnv = { AI?: Ai; CLOUDFLARE_ACCOUNT_ID?: string; AI_GATEWAY_ID?: string; AI_GATEWAY_BASE_URL?: string };
export type ProviderCredentials = Record<string, string>;
const fallback = (provider: ProviderContribution) => provider.models;
const asModels = (provider: ProviderContribution, payload: unknown): ProviderModel[] => {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const rows = Array.isArray(payload) ? payload : Array.isArray(root.data) ? root.data : Array.isArray(root.models) ? root.models : Array.isArray(root.result) ? root.result : [];
  const seen = new Map<string, ProviderModel>();
  for (const row of rows) {
    const item = typeof row === "string" ? { id: row } : row && typeof row === "object" ? row as Record<string, unknown> : {};
    let id = String(item.id ?? item.name ?? item.model ?? "").trim();
    if (provider.adapter === "gemini") id = id.replace(/^models\//, "");
    const methods = Array.isArray(item.supportedGenerationMethods) ? item.supportedGenerationMethods.map(String) : [];
    if (!id || (provider.adapter === "gemini" && methods.length && !methods.includes("generateContent"))) continue;
    if (!seen.has(id)) seen.set(id, { id, title: String(item.displayName ?? item.label ?? id), capabilities: ["chat"] });
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
};
const gateway = (env: ProviderRuntimeEnv, slug: string, direct: string, suffix: string) => env.CLOUDFLARE_ACCOUNT_ID && env.AI_GATEWAY_ID ? `${(env.AI_GATEWAY_BASE_URL ?? "https://gateway.ai.cloudflare.com/v1").replace(/\/$/, "")}/${env.CLOUDFLARE_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/${slug}${suffix}` : direct;
const auth = (credentials: ProviderCredentials, key = "api_key") => { const value = credentials[key]?.trim(); if (!value) throw new Error("Provider credential is missing."); return value; };
async function responseModels(provider: ProviderContribution, response: Response) { const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(`Model discovery failed with status ${response.status}.`); const models = asModels(provider, payload); return models.length ? models : fallback(provider); }
export async function detectProviderModels(env: ProviderRuntimeEnv, provider: ProviderContribution, credentials: ProviderCredentials): Promise<ProviderModel[]> {
  switch (provider.adapter) {
    case "cloudflare-workers-ai": {
      if (env.AI) { const models = asModels(provider, await env.AI.models()); if (models.length) return models; }
      const token = credentials.api_token?.trim(); const account = credentials.account_id?.trim() || env.CLOUDFLARE_ACCOUNT_ID;
      if (!token || !account) return fallback(provider);
      return responseModels(provider, await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/models/search?per_page=100`, { headers: { authorization: `Bearer ${token}` } }));
    }
    case "openai": return responseModels(provider, await fetch(gateway(env, "openai", "https://api.openai.com/v1/models", "/models"), { headers: { authorization: `Bearer ${auth(credentials)}` } }));
    case "groq": return responseModels(provider, await fetch(gateway(env, "groq", "https://api.groq.com/openai/v1/models", "/openai/v1/models"), { headers: { authorization: `Bearer ${auth(credentials)}` } }));
    case "github-models": return responseModels(provider, await fetch(gateway(env, "github", "https://models.github.ai/catalog/models", "/catalog/models"), { headers: { authorization: `Bearer ${auth(credentials, "token")}` } }));
    case "gemini": return responseModels(provider, await fetch(gateway(env, "google-ai-studio", `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(auth(credentials))}`, `/v1beta/models?key=${encodeURIComponent(auth(credentials))}`)));
    case "openai-compatible": throw new Error("Custom compatible providers must contribute a discovery endpoint adapter.");
  }
}
export async function testProvider(env: ProviderRuntimeEnv, provider: ProviderContribution, credentials: ProviderCredentials, modelId?: string) {
  const started = Date.now(); const models = await detectProviderModels(env, provider, credentials); const model = modelId ?? models[0]?.id;
  if (!model) throw new Error("No model detected for provider.");
  return { ok: true, providerId: provider.id, modelId: model, detectedModels: models.length, latencyMs: Date.now() - started };
}
