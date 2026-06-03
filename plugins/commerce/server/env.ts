export interface CommerceEnv {
  COMMERCE_DB: D1Database;
  COMMERCE_KV?: KVNamespace;
  COMMERCE_ASSETS?: R2Bucket;
}
