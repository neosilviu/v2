# Agent AI tool calls

Agent AI can request runtime tools, but Core remains the only policy, approval and audit authority.

## Flow

1. A user message starts an Agent AI run.
2. Agent AI sends the conversation to the selected provider with a constrained JSON tool-call instruction.
3. If the model returns a supported tool-call JSON object, Agent AI creates an `agent_tool_calls` row for the run/channel with `pending` status.
4. Agent AI submits the request to Core `/tools/execute` using the internal `CORE` service binding.
5. Safe tools may complete immediately and are stored as `completed`.
6. Sensitive tools return `approval-required`; Agent AI stores the `approvalId` and waits.
7. A platform administrator approves or denies in Core.
8. Agent AI refreshes the stored tool call, checks Core approval status and retries `/tools/execute` only for `approved` approvals.
9. Core atomically consumes the approval and audits `tool.execute`; Agent AI stores `completed`, `denied` or `failed`.
10. Completed tool results are appended as tool messages and sent back to the selected provider to produce the final assistant response.

Agent AI never executes tool handlers directly, never writes Core approvals and never treats browser input as authorization.

## Local UI

The native Agent AI surface renders the current conversation's tool calls and includes a small generic request form for controlled development testing. It is not a tool-specific executor. The form creates the same persisted Agent AI tool-call records that model-generated tool calls use.

## Remaining tool-loop work

The current implementation supports one structured JSON tool call per run. The next hardening block should add provider-native tool-call adapters, multiple tool calls per turn, streaming events and richer tool result envelopes.
