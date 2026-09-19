# Vercel, Cloudflare, and R2 Operations Runbook

**Date:** 2026-09-19  
**Audience:** DataNexus AI production operators and engineering agents  
**Purpose:** Preserve the operational controls established during the Vercel deployment-capacity incident.

## Current operating objective

Keep the existing Vercel production service stable while allowing high-volume engineering work to continue without generating hundreds of automatic cloud deployments.

Cloudflare is an approved secondary canary/DR direction, not an immediate production replacement.

## Vercel controls

### Git integration

Operational state established during the incident:

`Vercel Git integration: DISCONNECTED`

Reason:

- prevent high-frequency Git pushes from creating Vercel deployment attempts;
- preserve the existing production deployment;
- allow GitHub CI and PR work to continue independently.

Do not reconnect Git during an intensive background-development period unless a deliberate release decision has been made.

Disconnecting Git must not be confused with deleting the project or production deployment.

### Deployment retention

Keep the approved retention policy unless later evidence justifies a change:

| Deployment class | Retention |
|---|---:|
| Canceled | 1 day |
| Errored | 1 day |
| Pre-production | 30 days |
| Production | 30 days |

### Blocked deployments

Treat `Blocked` deployment entries as terminal records, not queued builds waiting to run.

Do not spend operator effort deleting blocked rows merely to "clear the queue". The important control is preventing unnecessary deployment creation.

### Production preservation

Do not delete:

- the current Production deployment;
- the Vercel project;
- the production domain;
- production environment variables.

## GitHub controls

Keep:

- GitHub Actions enabled;
- protected `main`;
- current repository rulesets;
- required status checks;
- automatic deletion of merged branches where configured;
- the Vercel GitHub App unless there is an independently approved reason to remove it.

GitHub remains the source of truth and release-validation plane even while Vercel Git auto-deployment is disconnected.

## Branch cleanup procedure

Branch cleanup is secondary housekeeping, not a quota-reset mechanism.

Before deleting a branch:

1. confirm whether a PR exists;
2. confirm whether it is open, merged, closed, or explicitly superseded;
3. compare the branch against current `main`;
4. verify it contains no unique work that must be preserved;
5. keep backup branches and uncertain branches until reviewed.

Never delete an open-PR branch solely because it is old.

## Production health checks

Before any production action, check:

```text
GET /api/health/live
GET /api/health/ready
GET /api/build-info
```

Expected semantics:

- `live`: service process responds;
- `ready`: required production controls and dependencies are safe for intended traffic;
- `build-info`: deployed artifact identity.

The last observed production health during this incident was:

- `/api/health/live`: `200 ALIVE`;
- `/api/health/ready`: `503 UNAVAILABLE`;
- critical cause: OPA enforcement unavailable;
- JDBC and OTLP were degraded.

This is an observation, not a permanent state. Revalidate before action.

Do not suppress a readiness failure simply to obtain HTTP 200.

## Exact-SHA release procedure

Production deployment must be deliberate.

Recommended sequence:

1. fetch the current protected `main` SHA;
2. confirm all required GitHub checks pass for the intended SHA;
3. record the exact SHA;
4. create one deliberate Vercel deployment for that SHA;
5. verify `/api/build-info` reports the intended SHA;
6. verify liveness;
7. verify readiness;
8. run production smoke tests;
9. preserve deployment/certification evidence.

Do not create a throwaway commit merely to trigger a deployment.

Do not return to the historical pattern of deploy-test-small-change-deploy-test.

## Cloudflare canary / DR boundary

Cloudflare is intended to provide a secondary runtime while Vercel remains primary.

Preferred topology:

```text
Production hostname -> Vercel
Canary hostname     -> Cloudflare
Object storage      -> Cloudflare R2
```

Do not redirect the production domain to Cloudflare merely because Vercel has a temporary quota issue.

Do not proxy the full Vercel production application through Cloudflare without a separately approved architecture change.

### Cost boundary

Cloudflare Containers require paid Workers capability.

Repository preparation, tests, configuration, and fail-closed infrastructure definitions may be completed without activating the paid service.

Live paid activation is an explicit owner-approval boundary.

### Canary authority

The canary must not automatically inherit unrestricted production authority.

Do not allow canary to:

- become the production durable-worker scheduler authority without migration certification;
- execute production R2 cutover;
- delete source storage;
- rewrite production storage references;
- send production notifications without explicit design;
- receive all production secrets by default.

## Durable worker authority

There must be one authoritative production scheduler.

Current repository design uses Supabase/Postgres scheduling authority.

The worker destination is provider-neutral and should be stored as:

`DGP_DURABLE_WORKER_URL`

The worker bearer secret remains a separate Vault secret.

Do not operate simultaneous Vercel and Cloudflare production schedulers.

Before moving the worker destination, validate:

- job lease behavior;
- retry behavior;
- idempotency;
- restart/recovery;
- negative/failure cases;
- exact deployed SHA;
- scheduler singularity;
- worker authorization.

## R2 production certification

### Required principle

Migration is copy-and-verify before cutover.

The migration stage must preserve:

`sourceObjectsDeleted == 0`

and:

`datasetVersionReferencesChanged == 0`

### Production certification target

The protected GitHub production environment controls:

`DATANEXUS_CERTIFICATION_TARGET_URL`

The workflow must fail closed if the target is not the governed production endpoint.

### OIDC authority

Production storage automation uses GitHub OIDC.

Do not weaken the production OIDC claim validation or replace it with a stale bearer-secret path merely to work around a hosting limit.

### Reference cutover

Always execute dry-run first.

Dry-run acceptance requires:

- no changed references;
- no destructive actions;
- no integrity mismatch;
- no unexpected errors;
- evidence that eligible references were actually examined.

Actual production cutover remains a separately governed action.

## R2 storage provider guard

Production R2 selection is protected by explicit approval.

Do not set:

`STORAGE_DEFAULT_PROVIDER=r2`

in Production unless the production R2 cutover has been approved and current certification evidence is valid.

The runtime now uses provider-neutral environment authority through `DATANEXUS_ENV`, with Vercel compatibility retained for migration safety.

## Rollback principles

### Web release

If a new release fails acceptance:

1. stop further release actions;
2. preserve the failed deployment evidence;
3. return traffic to the last known-good production deployment using the platform's normal rollback/promote mechanism;
4. do not mutate storage-provider authority as part of web rollback unless the storage change is separately involved;
5. record the exact rollback SHA.

### Worker migration

If a future Cloudflare worker runtime fails:

1. disable new Cloudflare worker execution;
2. keep the Supabase scheduler singular;
3. restore `DGP_DURABLE_WORKER_URL` to the last certified worker endpoint;
4. verify queue leases/retries before resuming;
5. do not create a second scheduler as a temporary workaround.

### R2 migration

Because copy-and-verify preserves the source and does not rewrite references during the copy stage, failure before cutover should leave Supabase source objects authoritative.

Do not delete sources during incident recovery.

## Manual release checklist

Before a deliberate release:

- [ ] current GitHub main SHA revalidated
- [ ] intended release SHA recorded
- [ ] required GitHub checks green
- [ ] no unresolved P0/P1 release blocker
- [ ] Vercel quota allows one deliberate deployment
- [ ] Git auto-deploy remains controlled
- [ ] deployed `/api/build-info` matches intended SHA
- [ ] `/api/health/live` passes
- [ ] `/api/health/ready` evaluated without suppressing failures
- [ ] authentication smoke test passes
- [ ] critical application smoke tests pass
- [ ] R2/OIDC code level matches the workflow before live storage certification
- [ ] production evidence retained

## Current repository implementation checkpoint

At the time this runbook was written, protected `main` was observed at:

`dd2ae42b202fd880293028285fe8878492fc4bce`

The repository already contained:

- `lib/runtime/environment.ts`;
- provider-neutral production detection in `lib/storage/factory.ts`;
- `app/api/build-info/route.ts`;
- provider-neutral `DGP_DURABLE_WORKER_URL` migration;
- environment-driven production R2 certification target;
- root Docker container packaging;
- `infra/cloudflare/runtime/`;
- `infra/cloudflare/worker-runtime/`.

Manual, exact-SHA Cloudflare deployment operations and cost-free preflight operations are now governed through `.github/workflows/release-governance.yml`; paid activation remains explicit and manual.

This section is time-sensitive. Revalidate before continuing implementation.

## Cloudflare/R2 implementation continuation checkpoint

**Baseline protected main at continuation start:** `dd2ae42b202fd880293028285fe8878492fc4bce`  
**Canonical working branch:** `cloudflare/r2-readiness-20260919`

The continuation is intentionally split into six independent workstreams that converge on one canonical branch to avoid recreating PR backlog:

| Stream | Objective | Repository status | External gate |
|---|---|---|---|
| 1. R2 smoke security | Require explicit probe approval in addition to exact preview ref and internal bearer auth | Implemented on working branch | Stale Vercel preview must still be retired or superseded |
| 2. R2 CORS | Keep exact-origin policy and make live mutation separately explicit | Implemented on working branch | Live bucket policy remains issue #605 until certified |
| 3. Cloudflare web canary | Add cost-free exact-SHA build/container preflight before paid deployment | Implemented on working branch | Workers Paid activation and Cloudflare credentials |
| 4. Cloudflare worker runtime | Fail closed if execution is enabled without complete secrets and enforce method boundaries | Implemented on working branch | Paid deployment, secrets, and execution approval |
| 5. R2 cutover/rollback | Add non-mutating rollback readiness mode and preserve copy-before-cutover | Implemented on working branch | Production dry-run evidence before any apply action |
| 6. Exact-head certification | Restore missing runtime verification scripts and keep production mutations opt-in | Implemented on working branch | Protected CI and exact-head merge/release evidence |

### Live evidence for issue #604

Vercel inspection on 2026-09-19 resolved the historical alias
`data-quality-ai-platform-git-r2-prereq-ha-4e83b5-shoaib143-sudo.vercel.app`
to deployment `dpl_FQRgNePBdBVP6sSVHUvcSKQt6xrT`, commit
`5ada2d230c1110faea689f26d148bc8226ea9dc4`, branch
`r2-prereq-hardening-20260916`. The deployment remains `READY`.

Do not close issue #604 merely because current source is hardened. Closure requires either retiring that stale deployment/alias or superseding it with hardened code and then proving unauthenticated access returns `401` or `404`. Removing a live deployment or alias is an explicit destructive operational action and is not performed automatically.

### Current activation order

1. Merge and exact-head certify the repository hardening branch.
2. Run `cloudflare-canary-preflight` and `cloudflare-worker-preflight` against the exact merged SHA. These are cost-free and do not deploy.
3. Run Storage R2 Assurance in `production-readiness` mode. This is read-only by default.
4. Resolve issue #604 by an explicitly approved Vercel retirement/supersession action.
5. Resolve issue #605 by explicitly approving the governed R2 CORS mutation only if read-only inspection proves mismatch.
6. Re-run R2 production certification and both cutover and rollback dry runs.
7. Only after those gates pass, consider paid Cloudflare canary deployment.
8. Keep worker execution disabled until queue lease, retry, idempotency, restart, authorization, exact-SHA, and scheduler-singularity certification pass.

