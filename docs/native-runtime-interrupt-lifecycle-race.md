# Approval versus timeout race

The human decision RPC and timeout processor lock the same interrupt row. If approval resolves first before the deadline, the timeout processor observes a non-pending interrupt and has no effect. If timeout commits first, a later human decision is recorded as late evidence and cannot restart execution.
