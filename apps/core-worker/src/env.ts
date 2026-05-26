import type { Fetcher } from "@cloudflare/workers-types";

export interface CoreEnv {
  CORE_DB: D1Database;
  PLUGIN_PACKAGES: R2Bucket;
  AUTH: Fetcher;
  APP_ORIGIN?: string;
  TRUSTED_ORIGINS?: string;
  RECOVERY_ADMIN_EMAILS?: string;
  RECOVERY_ADMIN_ENABLED?: string;
  PLATFORM_ADMIN_EMAILS?: string;
  ENVIRONMENT?: string;
}
