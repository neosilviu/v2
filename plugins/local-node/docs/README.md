# Local Node

Local Node is the v2 boundary for a separately installed local runner used by a copy-center deployment.

Current vertical slice:

- runtime Settings tab contribution: `local-node.settings`;
- Local Production status surface;
- typed contracts in `@v2/local-node-contracts`;
- development mock runner exposing `GET /health`;
- explicit `not-configured` / `mock-development-only` states for print, Gmail and WhatsApp.

Not implemented in this slice:

- real printing;
- Gmail OAuth/watch integration;
- WhatsApp session pairing;
- privileged command execution beyond the declared approval boundary.

Run the mock runner for local UI checks:

```bash
node plugins/local-node/server/mock-runner.mjs
```
