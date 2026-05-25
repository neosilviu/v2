# Pending Core integration contracts

The Core/Auth correction branch deliberately does not modify feature plugins, Web UI, Runtime Bridge or shared plugin/provider contracts. The following integration work must be applied in the owning branch after this correction is validated:

1. The Web API client must send authenticated credentials when communicating with Core across configured development or production origins.
2. A persisted approval-flow contract should replace the interim policy in which only a platform administrator can confirm sensitive tool execution.
3. Core must add a generic runtime asset-serving endpoint for installed `sandbox-frame` UI surfaces, connected to the already implemented Web iframe renderer without importing feature-plugin UI code.
4. Workspace RBAC should replace the bootstrap platform-admin configuration once authorization contracts are designed.
5. Private plugin runtimes should later receive scoped service identity controls before any internal runtime read endpoint is exposed through a public gateway.
