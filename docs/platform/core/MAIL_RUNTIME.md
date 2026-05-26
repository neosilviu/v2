# Core Mail Runtime

Core owns transactional mail delivery for the platform.

Core Mail Runtime sends owner setup links, workspace invitations, email verification, password reset/setup and future system notifications.

Transactional providers are workspace-owned Core configuration. The provider kinds implemented now are `smtp` and `mock-development-only`. The mock provider is for local smoke tests only and is rejected in production.

The v1 Core reference exposed `smtp`, `resend`, `mailgun` and `gmail` provider kinds. In v2 only `smtp` is implemented as a Core transactional provider now. `gmail` is intentionally not a Core transactional provider; Gmail belongs to Local Node customer communication channels.

Secrets and metadata are separated:

- sender name, sender email, reply-to, host, port and secure mode are safe metadata;
- usernames and passwords must be stored server-side and referenced through `configuration_ref`;
- Core APIs return only safe configuration and configured/missing indicators;
- passwords, tokens and provider secrets must not be written to D1 metadata, manifests, logs or public payloads.

The database stores `workspace_mail_providers`, `workspace_mail_templates` and `mail_delivery_events`. If no active default transactional provider exists, Core records a safe failed delivery event and Auth policy publication must not enable required email verification.
