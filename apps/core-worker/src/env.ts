import type { Fetcher } from "@cloudflare/workers-types";

export interface CoreEnv {
  CORE_DB: D1Database;
  PLUGIN_PACKAGES: R2Bucket;
  AUTH: Fetcher;
  APP_ORIGIN?: string;
  TRUSTED_ORIGINS?: string;
  PLATFORM_ADMIN_EMAILS?: string;
}
