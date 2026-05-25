import type { Fetcher, VectorizeIndex } from "@cloudflare/workers-types";

export interface AgentAiEnv {
  AGENT_DB: D1Database;
  AGENT_KV?: KVNamespace;
  AGENT_ASSETS?: R2Bucket;
  AGENT_VECTORIZE?: VectorizeIndex;
  CORE: Fetcher;
  PROVIDER_RUNTIME: Fetcher;
  KNOWLEDGE_RUNTIME?: Fetcher;
  PAGE_CONTEXT?: Fetcher;
}
