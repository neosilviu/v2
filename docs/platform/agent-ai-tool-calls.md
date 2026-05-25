# Agent AI tool calls

Agent AI can request runtime tools, but Core remains the only policy, approval and audit authority.

## Flow

1. Agent AI creates an `agent_tool_calls` row for a channel/run with `pending` status.
2. Agent AI submits the request to Core `/tools/execute` using the internal `CORE` service binding.
3. Safe tools may complete immediately and are stored as `completed`.
4. Sensitive tools return `approval-required`; Agent AI stores the `approvalId` and waits.
5. A platform administrator approves or denies in Core.
6. Agent AI refreshes the stored tool call, checks Core approval status and retries `/tools/execute` only for `approved` approvals.
7. Core atomically consumes the approval and audits `tool.execute`; Agent AI stores `completed`, `denied` or `failed`.

Agent AI never executes tool handlers directly, never writes Core approvals and never treats browser input as authorization.

## Local UI

The native Agent AI surface renders the current conversation's tool calls and includes a small generic request form for controlled development testing. It is not a tool-specific executor. The form creates the same persisted Agent AI tool-call records that model-generated tool calls will use later.
