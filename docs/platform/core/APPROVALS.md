# Persistent tool approvals

Sensitive runtime tools no longer rely on a browser-supplied boolean. When policy requires approval, Core creates a one-time `tool_approvals` record storing the tool identity, owning plugin, workspace and submitted input.

## Flow

1. A user requests tool execution through `/tools/execute`.
2. If approval is required, Core returns `approvalId` and stores a pending record.
3. A platform administrator records `approved` or `denied` through `/tool-approvals/decision`.
4. Execution supplies the approved `approvalId`; Core atomically claims it (`approved` to `consumed`) and uses the persisted input rather than any replacement client payload.
5. The claimed approval cannot be executed twice, including under concurrent requests. If dispatch later fails, a new approval is required; the failed attempt remains auditable.

This supports UI approvals now and is the policy foundation for Agent AI tool calls later. `apps/core-worker/src/db/schema.ts` remains the structural source of truth; `0002_tool_approvals.sql` is the incremental reviewed migration for the current database history.
