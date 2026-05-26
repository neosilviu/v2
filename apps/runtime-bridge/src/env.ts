export interface BridgeEnv {
  CORE: Fetcher;
  PLUGIN_RUNTIME_BINDINGS?: string;
  [binding: string]: unknown;
}
