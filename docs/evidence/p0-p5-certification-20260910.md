# P0-P5 Revalidation Certification

Date: 2026-09-10

P0-P5 revalidation passed.

- P0: certification state transitions are governed through service-only database RPCs, and direct certification-state mutation is blocked by a database trigger.
- P1: profiling persists evidence only from trusted source rows; the metadata-only fabricated-evidence fallback is removed.
- P2: applicable AI operations use the shared governed model gateway and provider-fallback contracts.
- P3: retrieval contracts enforce scoped retrieval, grounding, and citation validity.
- P4: pinned CI validates security/evidence boundaries, TypeScript, profiling lifecycle, governance review and single-organization contracts, governed AI/retrieval/provider fallback, live database contracts when credentials are available, and production build behavior.
- P5: worker claims are isolated into CORE, SEMANTIC, and GOVERNANCE pools through `orchestration.claim_jobs_by_pool`, with project concurrency capacity enforced in the database and execution restricted to `service_role`.

Live P5 measurement on Supabase: 30 claims per pool. CORE average 0.652 ms / p95 1.095 ms / max 6.898 ms; SEMANTIC average 0.327 ms / p95 0.371 ms / max 0.393 ms; GOVERNANCE average 0.351 ms / p95 0.404 ms / max 0.423 ms. Invalid pool input was rejected with SQLSTATE 22023. With four synthetic RUNNING jobs at the configured capacity of four, an additional CORE claim returned zero rows. All fixtures were rolled back transactionally.
