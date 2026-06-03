# Pending Core integration contracts

Implemented on the current platform branch:

- the Web API client includes browser session credentials in Core calls and plugin uploads;
- Core serves validated active `sandbox-frame` HTML surfaces from installed plugin ZIP archives through `/runtime/ui/surfaces/:surfaceId`;
- served plugin frames are restricted by CSP, no-store caching and iframe sandboxing in the Web host.

Remaining coordinated work:

1. Add a persisted approval-flow contract to replace interim administrator-only confirmation of sensitive tool execution.
2. Replace bootstrap platform administrators with workspace RBAC when authorization contracts are designed.
3. Add scoped service identity controls before internal runtime endpoints are exposed through a public gateway.
4. Define a typed, capability-checked host/frame message bridge for sandbox plugin interactions; the current runtime serves isolated HTML only.
