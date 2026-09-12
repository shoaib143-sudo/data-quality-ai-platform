# Native runtime interrupt lifecycle release behavior

This slice closes the runtime interrupt lifecycle without increasing autonomous authority.

The scheduled worker processes due interrupts once per minute. Human approval and manual-review timeouts are escalated and remain non-runnable. External-input and dependency timeouts cancel the waiting run. Human rejection also cancels the run. Only a resolved `APPROVED` interrupt can resume.

Timeout processing is service-role-only, row-locked, idempotent per interrupt, and records append-only terminal evidence. Human decisions attempted after timeout are recorded separately and cannot change the timeout result.
