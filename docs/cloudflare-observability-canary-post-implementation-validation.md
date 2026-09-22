# Cloudflare OBSERVABILITY Canary Post-Implementation Validation

## Objective

Operate Cloudflare as a narrowly scoped execution lane for canary-tagged OBSERVABILITY jobs while retaining:

- Vercel as the interactive/control-plane runtime.
- Supabase as the transactional state and scheduler authority.
- A single claim authority for each job subset.
- Explicit owner activation and a fail-closed kill switch.
- Reversible rollout with no implicit Vercel, R2, or broader worker cutover.

## Pre-activation gates

All gates must pass before enabling live canary dispatch:

1. Protected-main CI is green on the exact activation SHA.
2. The Cloudflare worker exact SHA is deployed from protected main.
3. `orchestration.claim_jobs_by_type(text,text,integer)` exists and is executable only by `service_role`.
4. General CORE claims exclude `OBSERVABILITY` rows tagged `executionLane=CLOUDFLARE_CANARY`.
5. Dedicated canary claims require both `OBSERVABILITY` and the canary execution-lane marker.
6. The Supabase canary scheduler is installed but returns without dispatch unless `DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED=true`.
7. Cloudflare worker execution remains restricted to `CLOUDFLARE_OBSERVABILITY_CANARY`.
8. A dedicated Cloudflare worker bearer credential is configured independently of the primary durable-worker credential.
9. No R2 production reference cutover or Vercel production deployment is coupled to canary activation.

## Revalidation

Re-run after every canary implementation or configuration change:

- `pnpm run verify:provider-neutral-runtime`
- `pnpm run verify:worker-runtime`
- TypeScript `tsc --noEmit`
- Production build
- Cloudflare worker bundle dry-run
- Standalone container health/build identity smoke test
- Exact-SHA live `/api/build-info` verification
- Supabase ACL and scheduler state verification

## Unit and integration coverage

Required coverage:

- Unsupported canary job types fail closed.
- Untagged OBSERVABILITY jobs remain on the CORE lane.
- Tagged OBSERVABILITY jobs are excluded from CORE claims.
- Tagged OBSERVABILITY jobs are claimable only through the dedicated canary RPC.
- The initial canary remains globally single-flight: no second canary job can be claimed while a live canary lease exists.
- Claim replay with the same worker identity returns the same live lease.
- Claim batch size remains bounded.
- Dependency gates and project concurrency limits remain enforced.
- Anonymous and authenticated roles cannot execute privileged claim or scheduler functions.
- Missing worker URL, missing credential, malformed URL, or disabled flag does not dispatch work.

## Independent adversarial audit

Perform a separate review of the implementation after normal tests pass. The audit must try to prove the rollout unsafe rather than confirm the intended design.

Audit targets:

- Split-brain claim paths.
- Duplicate execution after gateway timeout or request replay.
- Scheduler misrouting to Vercel or another non-Cloudflare endpoint.
- General `ADAPTIVE_DISPATCH` bypass.
- Missing or stale lease fencing.
- Privilege inheritance through PUBLIC, anon, or authenticated roles.
- Secret exposure through UI, logs, workflow output, build artifacts, or client-visible environment variables.
- Canary job starvation when execution is disabled.
- Recovery behavior when Cloudflare is unavailable.
- Accidental expansion from OBSERVABILITY to other durable job types.

## Live negative and failure cases

After activation, verify:

1. Unauthenticated POST to `/api/jobs/worker` returns 403.
2. Authenticated `ADAPTIVE_DISPATCH` returns 403 on Cloudflare.
3. Authenticated canary request with an invalid mode returns 403.
4. Disabled execution returns 503.
5. Missing required privileged runtime configuration returns 503.
6. No canary-tagged jobs returns 200 with `claimed=0`.
7. A synthetic canary-tagged OBSERVABILITY job can be claimed once and cannot be claimed by the CORE lane.
8. A second worker cannot claim another canary-tagged job while the first live canary lease exists.
9. Replaying the same claim identity does not create a second lease.
10. Cloudflare unavailability leaves canary-tagged jobs queued/retryable rather than making them eligible to the CORE lane.

## UI/UX validation

The Infrastructure Admin view remains read-only. Validate:

- Cloudflare worker canary policy is visible only to OWNER/ADMIN.
- Allowed workload is shown as OBSERVABILITY.
- Claim limit is shown as one job per cycle.
- Scheduler authority is shown as Supabase.
- Kill-switch behavior is communicated as default-off and owner-approved.
- No destructive activation/deactivation CTA is exposed in the UI.
- Navigation, accessibility labels, responsive layout, and keyboard operation remain intact.

## Activation sequence

1. Merge all implementation changes to protected `main`.
2. Apply forward-only Supabase migrations.
3. Use the protected canary-enable workflow to synchronize the dedicated Cloudflare worker URL and bearer secret into Supabase Vault with the scheduler still disabled.
4. Confirm `DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED=false` before worker deployment.
5. Continue the protected Cloudflare worker canary-enable release workflow against the exact current-main SHA.
6. Verify health, exact build identity, unauthorized rejection, and broad-dispatch rejection.
7. Enable the Supabase canary scheduler flag.
8. Execute one synthetic canary-tagged OBSERVABILITY job.
9. Re-run negative/failure-path checks and inspect telemetry.
10. Keep the workload restricted until observation evidence supports expansion.

## Rollback

Immediate rollback requires no code rollback:

1. Run the governed `cloudflare-worker-canary-disable` release operation, which disables the Supabase canary scheduler first.
2. The same rollback operation redeploys the worker with `DATANEXUS_WORKER_EXECUTION_ENABLED=false` and verifies the 503 execution boundary.
3. Do not retag canary jobs into the CORE lane automatically.
4. Inspect any RUNNING canary leases and allow lease expiry or use the established stale-job recovery path.
5. Confirm the primary Vercel durable-worker scheduler remains unchanged and healthy.

Only after rollback evidence is clean should any code-level reversal be considered.


## Post-activation fail-closed behavior

The protected canary-enable workflow must verify the live Supabase canary status immediately after enabling scheduling. Certification requires all of the following:

- enabled = true
- runtime configuration present
- canary cron active at five-minute cadence
- allowed job type = OBSERVABILITY
- scheduler authority = Supabase
- single-flight limit = 1

If any later activation step fails, the workflow performs best-effort fail-closed cleanup:

1. disable the Supabase Cloudflare canary scheduler flag;
2. redeploy the Cloudflare worker with `DATANEXUS_WORKER_EXECUTION_ENABLED=false`;
3. leave the primary Vercel durable-worker scheduler unchanged.

The original workflow failure remains the release outcome. Cleanup warnings must not be interpreted as successful activation.


## Readiness operation

Before live activation, run the protected `cloudflare-worker-canary-readiness` operation against the exact protected-main SHA. It performs no deployment and no scheduler enablement. It verifies:

- exact SHA is reachable from protected `main`;
- Cloudflare account/token, worker bearer secret and Supabase service-role credentials are available in the protected `cloudflare-worker` environment;
- the configured Cloudflare worker URL is an exact HTTPS `/api/jobs/worker` endpoint;
- the Supabase canary scheduler remains disabled before activation;
- scheduler cadence, OBSERVABILITY allowlist, Supabase authority and single-flight limit match the governed contract.

## Post-activation certification

After the enable workflow succeeds, execute `supabase/verify_cloudflare_observability_canary_postactivation.sql`.

It fails closed unless the canary is enabled, runtime configuration is present, the five-minute Supabase scheduler is active, the workload remains OBSERVABILITY-only, the single-flight invariant holds and every live canary lease belongs to the dedicated Cloudflare worker identity.

The rollback operation additionally verifies the worker returns the disabled-execution boundary and that Supabase reports the canary scheduler flag disabled.


## Supabase API key compatibility

Protected release workflows support both legacy JWT-based `service_role` keys and modern opaque `sb_secret_...` keys.

- The Supabase key is always sent in the `apikey` header.
- `Authorization: Bearer ...` is added only when the configured key has JWT shape.
- Opaque secret keys are never sent as bearer tokens.
- A readiness HTTP 401 should therefore be treated as an invalid, revoked, or mismatched protected environment key rather than as a workflow header-format failure.

This applies consistently to readiness, enablement, live status verification, failure cleanup, disablement, and rollback-status verification.
