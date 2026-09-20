# Vercel Capacity Incident, Cloudflare Continuity, and Runtime Decisions

**Date:** 2026-09-19  
**Status:** Active operational decision record  
**Scope:** Vercel capacity incident, deployment governance, Cloudflare continuity architecture, R2 certification, provider-neutral runtime boundaries

## Executive summary

DataNexus AI hit Vercel Hobby deployment and storage limits during a period of very high Git activity. Investigation showed that the primary cause was deployment multiplication rather than end-user traffic or uploaded dataset volume.

The operating decision is:

- keep Vercel as the primary user-facing Next.js runtime;
- keep Vercel Git auto-deployment disconnected while high-volume development continues;
- use GitHub as the source of truth, CI authority, and exact-SHA release gate;
- keep Supabase authoritative for database, authentication, durable queue, audit, and control state;
- use Cloudflare R2 for object storage;
- add Cloudflare as a secondary canary/disaster-recovery runtime and future heavy-worker execution plane, not as an immediate Vercel replacement;
- retain a single authoritative scheduler;
- perform production releases deliberately from a validated immutable Git SHA;
- do not weaken R2, OIDC, readiness, or cutover controls to bypass a temporary hosting limit.

## Incident evidence and root cause

At the time of investigation, Vercel Hobby usage showed approximately:

| Resource | Observed usage |
|---|---:|
| Functions Storage | 37.67 GB / 10 GB |
| Deployment Storage | 9.03 GB / 10 GB |
| Function Invocations | 235K / 1M |
| Edge Requests | 184K / 1M |
| Fast Origin Transfer | 350 MB / 10 GB |
| Fast Data Transfer | 696 MB / 100 GB |

The account also hit the Hobby deployment-creation guard and produced errors equivalent to:

`api-deployments-free-per-day`  
`Resource is limited - try again in 24 hours`  
`more than 100`

A sample of Vercel history covered roughly 640 deployment records over about four days, with approximately 434 READY deployments. Some branches produced ten or more deployments each.

The former development pattern was effectively:

```text
small change
  -> push
  -> preview/build
  -> test
  -> production/promote
  -> test
  -> repeat
```

For a large Next.js server surface, a small source diff can still rebuild and retain substantial function artifacts. The deployment count therefore multiplied storage consumption.

The incident was not primarily attributable to:

- production request volume;
- Supabase Storage object volume;
- Cloudflare R2 object volume;
- CSV uploads;
- ordinary Git repository source size.

## Immediate controls already applied

### Vercel Git integration

The repository was deliberately disconnected from the Vercel project while intensive background development continues.

This preserves the existing production deployment while preventing ordinary Git pushes from generating further automatic Vercel deployment attempts.

This is an operational throttle, not a permanent architecture requirement.

### Retention policy

The approved retention state is:

| Deployment class | Retention |
|---|---:|
| Canceled | 1 day |
| Errored | 1 day |
| Pre-production | 30 days |
| Production | 30 days |

### Repository-side deployment allowlist

`vercel.json` now disables automatic Git-triggered deployments for every branch, including `main`. Production and preview deployments are deliberate release actions rather than side effects of Git pushes. This repository-side safeguard remains in force even if the Vercel Git integration is later reconnected.

### Branch hygiene

Historical branch accumulation was identified as a secondary cleanup concern because retained active branches can preserve associated deployment history. Branch deletion must remain evidence-driven. Open PR branches, uncertain branches, backup branches, and branches containing unique commits must not be removed blindly.

## Blocked deployment semantics

Vercel entries in `Blocked` state were treated as terminal deployment records, not queued builds waiting to execute later.

Deleting those rows is not a substitute for preventing deployment creation and does not reset the rolling deployment-creation quota.

The required control is to prevent unnecessary deployment attempts at the source.

## Current target architecture

The accepted direction is active-passive, not active-active:

```text
                         GitHub
                 Source + CI + Release Authority
                           |
                    immutable exact SHA
                           |
               +-----------+-----------+
               |                       |
               v                       v
        Vercel Production        Cloudflare Canary / DR
        Primary web runtime      Secondary runtime
               |                       |
               +-----------+-----------+
                           |
                    Shared durable plane
                           |
           +---------------+----------------+
           |               |                |
           v               v                v
       Supabase         Cloudflare R2    Worker runtime
   DB/Auth/Queue/Audit  Object storage   future container
```

### Runtime responsibilities

| Capability | Authority |
|---|---|
| Primary UI, SSR, RSC, ordinary API routes | Vercel |
| Canary and disaster-recovery web runtime | Cloudflare |
| Large object/data storage | Cloudflare R2 |
| Database | Supabase Postgres |
| Authentication | Supabase Auth |
| Durable queue/control state | Supabase |
| CI, governance checks, exact-SHA certification | GitHub Actions |
| Heavy profiling/orchestration execution | Cloudflare Container target |
| Production release | Deliberate exact-SHA deployment |

Cloudflare is complementary infrastructure. It is not an emergency rewrite of the application and is not intended to replace Vercel merely because a temporary Hobby quota was reached.

## Cloudflare product decisions

### Cloudflare Pages

Not selected for the full DataNexus application.

The application is a full-stack Next.js system with SSR, React Server Components, route handlers, authentication, many APIs, durable jobs, profiling, governance, and orchestration.

### Workers Free

Not selected as the complete backend runtime.

The execution profile is too heavy for the free Worker CPU/memory envelope.

### Cloudflare Tunnel

Useful for temporary development and debugging access. It is not the governed production execution environment for storage migration or long-running orchestration.

### Cloudflare Containers

Preferred for the robust canary/DR runtime and future heavy worker execution plane.

Activation of Workers Paid is an explicit external-cost boundary and requires owner approval before live paid deployment.

## Do not proxy the entire Vercel application through Cloudflare

The selected topology avoids an unnecessary Cloudflare-to-Vercel hop.

Preferred:

```text
production hostname -> Vercel
canary hostname     -> Cloudflare
objects/signed URL  -> R2
```

Do not change the production DNS simply to work around the temporary Vercel incident.

## Provider-neutral runtime work

The architectural review found three Vercel-specific couplings that needed removal.

### 1. Environment authority

Production safety must not depend exclusively on `VERCEL_ENV`.

Current main now contains `lib/runtime/environment.ts`, including:

- `DATANEXUS_ENV=production|canary|development`;
- `DATANEXUS_PLATFORM=vercel|cloudflare|local`;
- a backward-compatible Vercel production bridge;
- exact deployment SHA/release/build identity helpers.

`lib/storage/factory.ts` now uses provider-neutral production detection while preserving the explicit R2 production-cutover approval guard.

### 2. Durable worker destination

The authoritative Supabase scheduler previously hard-coded the Vercel worker endpoint.

Current main now includes:

`supabase/migrations/20260919121000_provider_neutral_durable_worker_url.sql`

The scheduler resolves `DGP_DURABLE_WORKER_URL` from Vault, validates an exact HTTPS `/api/jobs/worker` endpoint, and preserves the single scheduler authority.

This enables controlled future migration of the execution plane without introducing a second production scheduler.

### 3. R2 certification target

The R2 assurance workflow previously hard-coded the Vercel application URL.

Current main now resolves `DATANEXUS_CERTIFICATION_TARGET_URL` from the protected GitHub production environment and fail-closes unless it matches the governed production endpoint.

The production OIDC audience remains `datanexus-r2-production`.

## Exact-SHA release identity

Current main contains:

`app/api/build-info/route.ts`

It exposes:

- commit SHA;
- environment;
- platform;
- build timestamp;
- release identifier.

Cloud deployment evidence should compare the intended validated GitHub SHA with the deployed artifact SHA. Avoid release instructions based on ambiguous phrases such as "latest main".

## Containerization status

Current main contains:

- root `Dockerfile`;
- root `.dockerignore`;
- Next.js standalone container packaging;
- runtime health check via `/api/health/live`;
- non-root runtime user.

Cloudflare canary definitions exist under:

`infra/cloudflare/runtime/`

The canary is explicitly active-passive with Vercel primary. Its ingress blocks production-authority endpoints and requires canary-scoped configuration.

A separate future execution-plane container definition exists under:

`infra/cloudflare/worker-runtime/`

The worker runtime is fail-closed until `DATANEXUS_WORKER_EXECUTION_ENABLED=true`, and the repository explicitly requires singular scheduler authority before changing the governed worker destination.

## R2 migration and certification boundary

The R2 migration remains a governed copy-and-verify process.

The copy phase must not:

- delete Supabase source objects;
- silently rewrite dataset-version references;
- bypass SHA-256/integrity checks.

Production certification must verify the migration state and approved CORS policy before any storage cutover.

Reference cutover must first pass in dry-run mode with:

- zero changed references;
- zero destructive actions;
- no integrity mismatch;
- no unexpected errors.

Do not activate `STORAGE_DEFAULT_PROVIDER=r2` in Production without the explicit production approval control and successful certification evidence.

## OIDC production boundary

The hardened storage automation uses GitHub OIDC and validates identity claims including issuer, audience, repository, environment, ref, event, workflow reference, subject, expiry, and signature.

Do not revert to legacy bearer-secret behavior merely to bypass a hosting quota.

At an earlier checkpoint, the running Vercel production revision predated the newer governed OIDC implementation. Therefore live R2 certification must always revalidate the currently deployed production SHA before execution.

## Health boundary

DataNexus preserves a distinction between:

- `/api/health/live`: the service process can respond;
- `/api/health/ready`: the application is safe for its intended production responsibility.

At the last direct check in this investigation, production liveness returned `200 ALIVE`, while readiness returned `503` because OPA enforcement was `UNAVAILABLE`. JDBC and OTLP were degraded but not the critical readiness cause.

That observation is time-sensitive and must be revalidated before any release or migration.

Do not weaken readiness semantics to hide an unavailable production control.

## Release operating model

### Ordinary backend work

```text
branch
  -> GitHub CI
  -> unit/integration/negative/adversarial/security checks
  -> exact-head validation
  -> merge logical work unit
  -> one deliberate production deployment
  -> production smoke/certification
```

### UI work

Use canary/preview selectively when visual, responsive, interaction, or accessibility validation genuinely requires a deployed surface.

### Cloudflare deployment

Cloudflare should use an explicitly governed/manual deployment path rather than deployment on every Git push. The Vercel incident must not be recreated on a second platform.

## Durable worker target

The long-term execution split is:

```text
Web plane
Browser -> Vercel -> enqueue durable work -> Supabase queue

Execution plane
Supabase scheduler -> Cloudflare worker container
                   -> profiling / metadata / DQ / governance / orchestration
                   -> Supabase + R2
```

The existing `app/api/jobs/worker/route.ts` can remain as a compatibility adapter during migration.

The worker authority must not move until lease, retry, idempotency, restart, exact-SHA, and scheduler-authority tests pass.

## Operational state at this record

Current repository state observed while writing this record:

- protected `main` SHA: `9bfe5d1b52fca19819c8785f583d1a8924c79b09`;
- provider-neutral runtime helpers are present;
- provider-neutral storage production detection is present;
- build-info endpoint is present;
- provider-neutral durable-worker URL migration is present;
- R2 certification target is protected and environment-driven;
- root containerization is present;
- Cloudflare web-canary and worker-runtime definitions are present;
- no automatic Cloudflare deploy workflow was found on `main` at this checkpoint.

Because background implementation is ongoing, every operational statement in this section must be revalidated before action.

## Non-negotiable controls

Do not:

1. reconnect Vercel Git during high-volume development merely to test a change;
2. use Production as the test runner for each small commit;
3. operate two production schedulers simultaneously;
4. copy all unrestricted production credentials into Cloudflare canary;
5. run destructive R2 cutover from canary;
6. bypass GitHub OIDC to use stale production authentication;
7. suppress OPA readiness failure to produce a green health result;
8. mass-delete branches without merge/ancestry evidence;
9. proxy all Vercel traffic through Cloudflare without a separately approved architecture change;
10. activate paid Cloudflare infrastructure without owner approval.

## Next release sequence

When the deployment quota and release window permit:

1. revalidate exact `main` SHA;
2. complete GitHub required checks;
3. select the exact certified release SHA;
4. create one deliberate Vercel production deployment;
5. verify `/api/build-info`;
6. verify `/api/health/live`;
7. verify `/api/health/ready`;
8. confirm the deployed revision contains current OIDC/R2 controls;
9. run production smoke validation;
10. run governed R2 assurance;
11. execute migration copy-and-verify;
12. execute production certification;
13. execute reference-cutover dry run;
14. review the evidence;
15. keep destructive cutover separately gated.

## Relationship to other records

This discussion record complements the architecture and implementation records already maintained under `Architecture/`. It captures the operational incident, the rationale for the active-passive Vercel/Cloudflare model, and the safeguards that must survive future implementation.
