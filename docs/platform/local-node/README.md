# Local Node Runtime Boundary

Local Node connects v2 to a separately installed runner for copy-center operations.

The current implementation is a testable vertical slice:

- `@v2/local-node-contracts` defines runner health, module, pairing, channel provider, thread, message, attachment, outbound reply and delivery receipt contracts.
- `plugins/local-node` contributes a runtime Settings tab and a Local Production status surface.
- The plugin declares `localnode.read`, `localnode.configure` and `localnode.execute` capabilities.
- A development mock runner exposes `GET /health` for UI smoke tests.

The runner is not executed as arbitrary Marketplace Worker code. Real local execution must stay behind an explicit service identity/pairing boundary and sensitive commands require approval.

Gmail and WhatsApp are customer communication channels owned by the Local Node Runner boundary. Gmail may later contribute inbox threads, messages, attachments for print intake and replies back to customers. It must not be used for Core/Auth owner setup, workspace invitations, email verification, password reset or system transactional notifications; those use Core Mail Runtime.

Not complete yet:

- real OS printer discovery and printing;
- Gmail OAuth/watch integration;
- WhatsApp session pairing;
- command execution against real hardware.
