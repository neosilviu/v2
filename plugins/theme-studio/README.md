# Theme Studio plugin

`theme-studio` is a lightweight UI/settings plugin. It contributes appearance settings and theme tools but does not own a Worker or a dedicated database.

## Responsibilities

- appearance settings surface;
- theme token editing, such as accent colour and density;
- reversible theme preview/save tools;
- use of platform-owned scoped settings for theme values.

## Layout

```text
plugins/theme-studio/
  src/index.ts
  ui/                 # future runtime-loaded settings UI, when needed
  README.md
```

## Data ownership

Theme Studio is intentionally different from stateful feature plugins. It uses generic platform settings scoped to `plugin:theme-studio`; it does not require its own D1, KV or Worker.

It must not write directly to Core tables. Theme changes are saved through generic settings/layout APIs and permission checks.

## Runtime integration

The manifest contributes:

- one settings surface in `settings.appearance`;
- appearance fields such as accent and density;
- safe preview and reversible save tools.

These contributions must be loaded through runtime manifest data. The web shell must not import Theme Studio implementation statically.

## Feedback and errors

Theme actions should emit shared notifications and shared error responses. Saving a theme requires `themes.write`; preview operations remain safe/reversible.

## Current status

Implemented: manifest contribution foundation. Remaining: runtime-loaded editor surface, persisted scoped settings integration, preview application and notification wiring.
