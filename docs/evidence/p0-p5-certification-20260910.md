# P0-P5 Revalidation Certification

Date: 2026-09-10

## Result

P0-P5 revalidation passed on the implementation branch and the substantive runtime/database changes are present on `main`.

## Evidence

- P0: certification state transitions are governed by service-only database RPCs and direct certification-state mutation is guarded at the database boundary.
- P1: profiling persists evidence only when trusted source rows are available; the metadata-only fabricated-evidence path is removed.
- P2: profiling enrichment and applicable AI calls use the shared governed model gateway with provider fallback contracts.
- P3: retrieval-provider contracts enforce scoped retrieval, grounding, and citation validity behavior.
- P4: the pinned P0-P5 revalidation workflow validates security/evidence boundaries, TypeScript, profiling lifecycle, governance review/single-organization contracts, governed AI/retrieval/provider fallback, live database contracts when secrets are available, and the production build.
- P5: worker claims are isolated into CORE, SEMANTIC, and GOVERNANCE pools through `orchestration.claim_jobs_by_pool`; the RPC enforces project concurrency capacity and is executable only by `service_role`. A 30-sample-per-pool live Supabase measurement plus invalid-pool and capacity-blocking checks is recorded in `docs/evidence/p5-worker-pool-benchmark-20260910.json`.

## Live P5 measurement

- CORE: average 0.652 ms, p95 1.095 ms, max 6.898 ms.
- SEMANTIC: average 0.327 ms, p95 0.371 ms, max 0.393 ms.
- GOVERNANCE: average 0.351 ms, p95 0.404 ms, max 0.423 ms.
- Invalid workload pool: rejected with SQLSTATE 22023.
- Configured max concurrent jobs: 4; with four synthetic RUNNING jobs, an additional CORE claim returned zero rows.
- All benchmark fixtures were created inside one transaction and rolled back.

## Final gate

GitHub Actions `revalidate` completed successfully for commit `6b41785b56ce5c2d60355e00f854daa216476daa` after the verified P5 evidence refresh. Vercel preview feedback check also completed successfully for that commit.
