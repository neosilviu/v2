# Plugin UI runtime

Feature plugins may contribute UI without becoming build-time dependencies of the platform host.

## Decision

The host supports two renderer modes:

- `declarative`: the shell renders metadata/settings fields using native components.
- `sandbox-frame`: the plugin package provides an isolated HTML UI asset which is rendered in a sandboxed iframe through a runtime endpoint.

Direct host-side execution of uploaded plugin JavaScript modules is intentionally not supported for ZIP-installed plugins.

## Manifest contract

A surface contribution may declare:

```json
{
  "id": "agent-ai.assistant-panel",
  "title": "Assistant",
  "zone": "assistant.right",
  "kind": "panel",
  "renderer": {
    "mode": "sandbox-frame",
    "entry": "ui/assistant.html"
  }
}
```

The entry is restricted to a local plugin asset path shaped like `ui/*.html`; an installed plugin cannot declare an arbitrary remote URL as its iframe source.

## Installation and approval

The ZIP installer treats sandbox UI packages as approval-requiring content. The installer stores package metadata and validated descriptor data; it must not execute uploaded UI or server code inside the Core request handling process.

## Runtime serving model

The generic web shell renders sandboxed surfaces by calling a Core/runtime route shaped as:

```text
/runtime/ui/surfaces/:surfaceId?workspaceId=:workspaceId
```

The runtime route must, when implemented:

1. confirm the surface belongs to an installed and active plugin for that workspace;
2. resolve only the validated package-owned HTML entry;
3. serve content with restrictive security headers;
4. avoid leaking package objects, secrets or cross-workspace assets;
5. deny access when the plugin is inactive or the surface is not declared.

## Browser isolation

The web shell mounts iframe surfaces with a restrictive sandbox and does not provide same-origin access by default. Communication between iframe UI and the host must later use a typed, capability-checked message bridge; no unrestricted `postMessage` command execution is allowed.

## Built-in plugins

Built-in feature plugins follow the same boundary. `AgentSurface.tsx` currently establishes plugin-owned UI source code, but it should only be activated as a runtime-loaded surface when its asset/loader path and server endpoint exist. Until then, its manifest may remain declarative to avoid exposing an unusable frame.

## Parallel Core dependency

Core/Auth work is isolated on `codex/core-auth-foundation`. That branch may implement or document the generic runtime asset endpoint only inside Core-owned files; it must not import or modify concrete plugin UI implementations.
