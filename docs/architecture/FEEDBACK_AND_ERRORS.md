# Feedback and error standard

All platform apps and feature plugins use one consistent feedback model.

## Shared contracts

`@v2/rpc-contracts` defines:

- `AppErrorCode` and structured `AppError` responses;
- `Notification` and notification severity levels;
- shared validation shapes consumed across platform and plugins.

`@v2/feedback-runtime` provides reusable helpers for constructing failures, safe error responses and notification queues.

## Error response shape

Services return errors in this form:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The request could not be processed.",
    "retryable": false,
    "requestId": "optional-correlation-id"
  }
}
```

Rules:

- use stable machine-readable codes;
- keep user-visible messages safe and concise;
- never include secrets, upstream tokens, stack traces, SQL, binding values or private content;
- add field errors only for user-correctable validation;
- add a request identifier for server-side correlation when available;
- plugin-specific domain context may be added only when safe and non-sensitive.

## Notification shape

Notifications are presentation events, not storage of errors or secret data. Each event carries:

- level: `info`, `success`, `warning` or `error`;
- title and optional safe message;
- source plugin/platform identifier;
- optional action command identifier;
- dismissible lifecycle metadata.

The web shell displays notifications through the generic `NotificationCenter` in `@v2/ui-kit`. Plugin UI should emit the common contract through runtime integration rather than render incompatible toast systems.

## Server usage

Core, Auth and plugin workers should map rejected requests and dependency failures to shared error responses. A failure must not be silently turned into success. Sensitive tool execution remains controlled by grants and approvals before a success notification is emitted.

## Plugin rules

- Plugins may add their own documented error codes only after extending shared contracts deliberately.
- Provider plugins never surface credential values in errors or notifications.
- Agent AI never embeds arbitrary tool output or page data into a notification.
- Theme Studio operations should use success/warning/error notifications for save/preview results.

## Pending integration

- apply standard errors to all existing Core/Agent/Provider HTTP routes;
- add runtime event transport so plugin-server events can surface as web notifications;
- add tests for secret redaction and notification rendering;
- allow Auth-owned implementation to consume the standard only through an agreed contract change if its parallel branch requires it.
