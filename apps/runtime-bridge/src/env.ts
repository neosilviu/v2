export interface BridgeEnv {
  DISPATCHER?: { get(name: string): Fetcher };
  PLUGIN_RUNTIME_LOCAL_ORIGIN?: string;
}
