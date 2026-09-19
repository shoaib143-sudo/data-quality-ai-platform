# DataNexus Cloudflare worker runtime

This runtime is the future execution-plane container for profiling, metadata, data-quality, governance, and orchestration work.

It is deliberately separate from the Cloudflare web canary. The ingress exposes only liveness, build identity, and the existing authenticated durable-worker endpoint.

Execution is fail-closed by default. `DATANEXUS_WORKER_EXECUTION_ENABLED` must be set to `true` before the ingress forwards `/api/jobs/worker`.

The container requires canary-scoped Supabase configuration plus `DATANEXUS_WORKER_SECRET`. Do not copy unrestricted production credentials into the canary environment by default.

The authoritative Supabase scheduler must remain singular. Do not change `DGP_DURABLE_WORKER_URL` until lease, retry, idempotency, restart, exact-SHA, and scheduler-authority validation pass.
