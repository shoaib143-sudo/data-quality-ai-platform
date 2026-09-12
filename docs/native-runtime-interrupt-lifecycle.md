# Native runtime interrupt terminal invariants

The native runtime interrupt lifecycle is intentionally fail-closed.

- Only a human `APPROVED` decision may transition a resolved interrupt back to runtime execution.
- A human `REJECTED` decision cancels the waiting agent run and records append-only terminal evidence.
- `HUMAN_APPROVAL` and `MANUAL_REVIEW` timeouts expire and escalate. The run remains waiting and cannot be resumed through the expired interrupt.
- `EXTERNAL_INPUT` and `DEPENDENCY` timeouts expire and cancel the waiting run.
- Timeout action is derived by server-owned policy and is not accepted from an HTTP request or user-controlled payload.
- A late human decision after timeout is append-only audit evidence. It never changes the terminal timeout result and never restarts execution.
- Timeout processing is idempotent per interrupt through the terminal action primary key and row-level locking.
- The scheduled worker discovers only due `PENDING` interrupts and delegates terminal mutation to the service-role-only database function.
- Runtime interrupt terminal evidence is append-only and project-scoped for authenticated reads.
