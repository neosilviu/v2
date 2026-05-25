# v2

AI-native runtime platform built around a minimal core, isolated authentication, configurable shell zones, and extensible plugins.

## Architecture principles

- **Runtime-first**: features register contributions rather than hardcoding application pages.
- **Minimal core**: core owns workspaces, settings, layouts, theme state, plugin installation and permission control.
- **Isolated auth**: Better Auth runs behind a dedicated auth worker and database boundary.
- **Extensible UI**: the web shell hosts runtime zones, settings contributions and plugin surfaces using a shared UI kit.
- **AI-native**: `agent-ai` supports channels, providers, tools and approvals.
- **Plugin packages**: built-in and ZIP-installed plugins can contribute UI and logic with explicit capabilities.

## Current foundation

```text
apps/
  core-worker/       Platform control plane and native plugin manager
  auth-worker/       Better Auth service boundary
  runtime-bridge/    MCP/runtime gateway for ChatGPT, Codex and external clients
  web/               Compact configurable shell UI
packages/
  plugin-contracts/  Plugin manifest and contribution schemas
  plugin-sdk/        Declarative helpers for plugins
  runtime/           Registry, event bus and runtime kernel
  ui-runtime/        Runtime shell state, zones and placements
plugins/
  agent-ai/          Built-in AI orchestration plugin
  theme-studio/      Built-in theme/settings plugin
```

## Storage ownership

- Core owns workspace/platform data and native plugin metadata.
- Auth owns identity/session/account data.
- Lightweight plugins can use platform or namespaced storage through controlled APIs.
- Large plugins can request dedicated bindings/resources.

## Runtime bridge

`apps/runtime-bridge` is a separate adapter for MCP-style access. It should reuse the same runtime tool registry, permission engine and audit layer as the web shell and `agent-ai`.

## Roadmap

See the official [RDAC roadmap](docs/RDAC.md).

## Status

Foundation branch in progress: `foundation/runtime-platform`.
