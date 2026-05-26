# Local Node Runtime Boundary

Local Node connects v2 to a separately installed runner for copy-center operations.

The current implementation is a testable vertical slice:

- `@v2/local-node-contracts` defines runner health, module, pairing, channel provider and command result contracts.
- `plugins/local-node` contributes a runtime Settings tab and a Local Production status surface.
- The plugin declares `localnode.read`, `localnode.configure` and `localnode.execute` capabilities.
- A development mock runner exposes `GET /health` for UI smoke tests.

The runner is not executed as arbitrary Marketplace Worker code. Real local execution must stay behind an explicit service identity/pairing boundary and sensitive commands require approval.

Not complete yet:

- real OS printer discovery and printing;
- Gmail OAuth/watch integration;
- WhatsApp session pairing;
- command execution against real hardware.
