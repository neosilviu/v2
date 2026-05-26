# Local Node Channels

Local Node channel providers are operational communication sources for a copy-center workspace.

Current contract boundary:

- `gmail` is a customer communication channel for inbox, threads, messages, attachments and replies.
- `whatsapp` is a customer communication channel for chat threads and replies.
- channel credentials and pairing live behind the separately installed runner boundary.
- `not-configured`, `mock-development-only` and `unavailable` states must be explicit.

Core Mail Runtime remains separate. Owner setup, workspace invitations, email verification, password reset and future system transactional notifications are Core-owned and must not depend on a local computer, Gmail OAuth session or WhatsApp pairing.
