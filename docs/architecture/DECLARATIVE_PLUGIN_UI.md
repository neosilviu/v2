# Declarative Plugin UI

Declarative UI is the standard runtime UI model for Marketplace plugins. A plugin may declare a surface renderer with a small schema in its manifest, and the Web shell renders that schema with `@v2/ui-kit`.

Trusted React registries discovered at build time remain available only as an optimization for first-party plugins included in the deployment. They must not be required for installing a new Marketplace plugin at runtime.

External plugins that need to ship arbitrary HTML or JavaScript continue to use `sandbox-frame` and the isolated runtime asset endpoint.
