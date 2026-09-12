# Native runtime interrupt lifecycle operations

Escalated approval and manual-review timeouts remain in `WAITING` and require governed human follow-up. Cancelled dependency/input timeouts are terminal and set the existing agent-run cancellation timestamps and reason. The scheduler reports discovered, changed, escalated, cancelled, and failed counts in the worker response for operational visibility.
