# Native runtime interrupt lifecycle negative matrix

| Scenario | Required result |
| --- | --- |
| Approval before expiry | Interrupt resolves and may resume only when decision is `APPROVED`. |
| Rejection before expiry | Waiting run becomes `CANCELLED`; resume is denied. |
| Approval timeout | Interrupt becomes `EXPIRED`; terminal action is `ESCALATED`; run stays `WAITING`. |
| Manual review timeout | Interrupt becomes `EXPIRED`; terminal action is `ESCALATED`; run stays `WAITING`. |
| External input timeout | Interrupt becomes `EXPIRED`; terminal action is `CANCELLED`; run becomes `CANCELLED`. |
| Dependency timeout | Interrupt becomes `EXPIRED`; terminal action is `CANCELLED`; run becomes `CANCELLED`. |
| Timeout processor repeats | Existing terminal action is returned; no second terminal action is created. |
| Human decision races timeout | Row locking serializes the race. The first terminal transition wins. |
| Human decision after timeout | Attempt is appended to late-decision audit and cannot restart the run. |
| Rejected interrupt passed to resume | Database rejects resume because decision is not `APPROVED`. |
| Expired interrupt passed to resume | Database rejects resume because terminal evidence exists / status is not resumable. |
| Caller tries to choose timeout action | No caller field exists; policy is derived server-side from interrupt type. |
| Scheduled worker runs before new RPC migration is deployed | Per-interrupt RPC errors are captured as sweep failures; the worker request remains observable rather than silently mutating state. |
