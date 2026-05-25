# Core Security

Core validates install, activation, grant, settings, layout and tool execution payloads before mutating state. JSON errors are normalized and do not include stack traces or secrets.

## Package Handling

Uploaded packages must be ZIP files no larger than 20 MB and must contain `plugin.json` at the archive root. Core parses package metadata and stores the raw ZIP in R2. It does not execute uploaded JavaScript in the control plane.

Sensitive packages require approval before installation when they declare sensitive/dangerous capabilities, dedicated resources, platform-worker isolation or module UI.

## Workspace Policy

Runtime contributions are visible for installed plugins, but tools and providers are exposed only when their owning plugin is active in the requested workspace. Tool execution requires the plugin to be active and every required tool permission to have been granted.

## Audit Events

Core records audit events for install approval requirements, install, activation, deactivation, capability grants, settings writes, layout saves, tool denial, tool approval requirements and tool execution acceptance.

## Open Work

Authentication and authorization for Core administration routes should be enforced by the platform edge once the Core/Auth integration contract is finalized. Rate limiting for package upload and tool execution is not implemented in Core yet.
