import type { Fetcher } from "@cloudflare/workers-types";

export interface WebsiteStudioEnv {
  WEBSITE_DB: D1Database;
  WEBSITE_KV?: KVNamespace;
  WEBSITE_ASSETS?: R2Bucket;
  CORE?: Fetcher;
}
