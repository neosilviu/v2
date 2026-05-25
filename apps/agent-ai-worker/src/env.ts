import type { Ai, Fetcher } from "@cloudflare/workers-types";
export interface AgentEnv { AGENT_DB: D1Database; CORE: Fetcher; AI?: Ai; CLOUDFLARE_ACCOUNT_ID?: string; AI_GATEWAY_ID?: string; AI_GATEWAY_BASE_URL?: string; }
