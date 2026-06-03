# Native plugin UI model

Official first-party plugins render natively inside the shell and use `@v2/ui-kit` for the same tokens, controls, spacing, feedback and theme behavior as the platform.

## Trusted modules

A first-party plugin may provide `ui/registry.tsx`, exporting a map from declared `surface.id` to a React component. The Web build discovers these checked-in registries through `import.meta.glob`; Web does not declare feature-plugin package dependencies and continues to build when no trusted plugin registry exists.

## Runtime activation

Core still controls installation and activation through plugin manifests. A trusted native component is mounted only when its corresponding manifest surface is active in the workspace. Having source code in the build is not sufficient to activate a plugin.

## External ZIP plugins

Arbitrary third-party UI from uploaded ZIP files is not loaded into the React host. Such packages may use declarative surfaces or the isolated `sandbox-frame` renderer. The sandbox endpoint and CSP are therefore a compatibility/security boundary for external extensions only, not the normal UI architecture of Agent AI, Website Studio, Commerce or Theme Studio.
