# Pending Core integration contracts

Implemented on the current platform branch: the Web API client now includes browser session credentials in Core calls and plugin uploads.

Remaining coordinated work:

1. Add a persisted approval-flow contract to replace the interim administrator-only confirmation of sensitive tool execution.
2. Add a generic runtime asset-serving endpoint for installed `sandbox-frame` surfaces, connected to the Web iframe renderer without importing feature-plugin UI code.
3. Replace bootstrap platform administrators with workspace RBAC when authorization contracts are designed.
4. Add scoped service identity controls before internal runtime endpoints are ever exposed through a public gateway.
