# Cloudflare OBSERVABILITY canary pre-activation evidence

## Certified baseline

Protected main SHA:

`a4ae749b410cf9fa8b847170cdbc4313498be6eb`

The canary execution lane is implemented, migrated and deliberately not live-enabled yet.

## Live Supabase evidence

Verified against project `tvjnavjxuehpesxcfvrx`:

- `orchestration.claim_jobs_by_type(text,text,integer)` exists.
- `orchestration.configure_cloudflare_observability_canary(text,text,boolean)` exists.
- `orchestration.kick_cloudflare_observability_canary()` exists.
- Claim/configuration/scheduler functions are executable by `service_role` and denied to `authenticated` and `anon`.
- `dgp-cloudflare-observability-canary-kick` is installed at five-minute cadence.
- The canary scheduler succeeds as a no-op while its activation flag is absent/false.
- The established `dgp-durable-worker-kick` remains active and the primary durable-worker URL remains Vercel.
- No live canary-tagged OBSERVABILITY jobs existed at the certification checkpoint.

## Transactional adversarial validation

Synthetic rows were inserted inside a transaction and rolled back.

Verified:

- CORE worker claims a normal OBSERVABILITY job.
- CORE worker does not claim `executionLane=CLOUDFLARE_CANARY` jobs.
- The dedicated canary RPC claims exactly one canary-tagged job.
- A second worker cannot claim another canary job while the first lease is live.
- A replay from the same worker returns the same lease.
- Invalid non-HTTPS worker URL is rejected.
- Too-short worker secret is rejected.

## CI evidence

PR #961 completed its exact-head validation with all 50 workflow families green before merge. This included release governance, worker runtime contracts, security checks, negative-path tests, container build/smoke checks, Wrangler dry-run validation and CodeQL.

## Remaining gated action

The implementation is ready for the protected manual release operation:

`cloudflare-worker-canary-enable`

That operation must:

1. synchronize the dedicated Cloudflare worker URL/credential into Supabase Vault with scheduling disabled,
2. deploy the exact protected-main SHA with `DATANEXUS_WORKER_EXECUTION_ENABLED=true`,
3. prove exact build identity,
4. prove unauthenticated requests fail,
5. prove broad `ADAPTIVE_DISPATCH` fails,
6. prove the narrow OBSERVABILITY canary mode succeeds,
7. only then enable the Supabase five-minute canary scheduler.

Rollback remains the separately governed `cloudflare-worker-canary-disable` operation, which disables scheduling before redeploying the worker with execution disabled.

No Vercel production deployment or R2 production cutover is part of this activation.
