# Native runtime interrupt lifecycle state machine

`RUNNING -> WAITING` occurs when an interrupt is requested. A timely approval produces `RESOLVED/APPROVED -> RESUMED -> RUNNING`. A rejection records `RESOLVED/REJECTED` and cancels the run. Timeout produces `EXPIRED`, followed by append-only `ESCALATED` or `CANCELLED` terminal evidence according to server-owned policy. No terminal path returns directly to `RUNNING`.
