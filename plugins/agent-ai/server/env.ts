import type { Ai, Fetcher } from "@cloudflare/workers-types";

export interface AgentAiEnv {
  AGENT_DB: D1Database;
  CORE: Fetcher;
  AI?: Ai;
  AGENT_KV?: KVNamespace;
  AGENT_ASSETS?: R2Bucket;
  CLOUDFLARE_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  AI_GATEWAY_BASE_URL?: string;
  AI_SEARCH_ENDPOINT?: string;
  AI_SEARCH_TOKEN?: string;
}
