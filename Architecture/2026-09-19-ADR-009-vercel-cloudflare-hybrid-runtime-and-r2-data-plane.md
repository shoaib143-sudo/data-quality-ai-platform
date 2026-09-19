# ADR-009: Vercel-Primary, Cloudflare-Secondary Runtime with R2 Data Plane

**Status:** Accepted target architecture; production activation remains gated  
**Date:** 2026-09-19

## Decision

DataNexus uses one release authority and three shared runtime planes.

```text
GitHub
Source of truth + CI/CD
        |
 exact-SHA release gates
        |
 +------+----------------------+
 |                             |
 v                             v
Vercel Production       Cloudflare Canary / DR
PRIMARY WEB RUNTIME     SECONDARY RUNTIME
Next.js native          Worker ingress
SSR / RSC / API                |
 |                             v
 |                      Cloudflare Container
 |                      Next.js standalone
 |                             |
 +-------------+---------------+
               |
      shared durable services
               |
   +-----------+-------------+
   |           |             |
   v           v             v
Supabase   Cloudflare R2   Worker Service
Control    Data plane      Execution plane
plane                     Cloudflare Container
DB/Auth    large files     profiling
Queues     snapshots       metadata scanning
Audit      documents       DQ/orchestration
Governance logs/artifacts
```

GitHub is the source of truth for release identity. Vercel remains the primary interactive web runtime. Cloudflare provides a separately governed canary/DR web runtime and a separately governed heavy worker/container runtime. Supabase remains the durable control plane. Cloudflare R2 is the bulk object/data plane.

## Runtime authority

The primary and secondary web runtimes must execute the same certified Git commit SHA. `/api/build-info` is the runtime evidence endpoint for commit, environment, platform, build timestamp, and release identity.

The Cloudflare web canary is active-passive and read-only by default. It denies every `/api/internal/*` path at ingress and does not receive Supabase service-role authority.

The Cloudflare worker runtime is separate from the web canary. Its ingress exposes only liveness, build identity, and the authenticated durable-worker endpoint. Worker execution is disabled by default.

## Durable scheduler authority

Supabase `pg_cron` remains the single authoritative production scheduler. The scheduler reads both `DGP_DURABLE_WORKER_SECRET` and `DGP_DURABLE_WORKER_URL` from Vault.

There must never be simultaneous Vercel and Cloudflare production schedulers. Switching the durable worker destination is a separately governed operational action after Cloudflare worker certification; the scheduler itself is not duplicated.

## Object data plane

R2 owns large object bytes: UI uploads, source documents, large text/log objects, future remote-source ingests, processing snapshots, and large profiling/DQ artifacts.

Supabase owns object registry metadata, project authorization, dataset/version relationships, verification state, governance state, and processing results.

Normal object storage and bulk object storage are separate routing decisions:

- `STORAGE_DEFAULT_PROVIDER` controls the ordinary default provider.
- `STORAGE_BULK_PROVIDER` controls large-object routing.
- production R2 bulk routing additionally requires `STORAGE_R2_BULK_UPLOADS_APPROVED=true`, unless the full production R2 cutover is already approved.
- full default-provider cutover continues to require `STORAGE_R2_PRODUCTION_CUTOVER_APPROVED=true`.

No browser receives R2 credentials. Browser uploads use short-lived signed operations. Large R2 objects use multipart upload. Every uploaded object must pass server-side existence, size, and content-type verification before becoming `READY`.

## Large-object profiling boundary

The in-memory file ceiling is a safety boundary, not a product-size quota. DataNexus does not raise it merely because R2 can store larger objects.

For large streamable R2 objects, profiling uses bounded byte-range sampling and explicitly records `BOUNDED_PREFIX_SAMPLE` evidence. Sample hashes have `SOURCE_PREFIX_SHA256` authority and cannot drive exact evidence reuse.

For oversized formats that cannot be safely row-sampled from a prefix, the current execution path records metadata-only evidence rather than buffering the full object. Row-level processing of those objects requires a streamable or partitioned representation.

Only complete observed bytes may carry `SOURCE_BYTES_SHA256` authority. Exact profiling-evidence reuse is restricted to that authority.

## Deployment and activation gates

Repository implementation and CI preparation are cost-free and may proceed independently. Live Cloudflare Container deployment is a separate activation step because it requires Workers Paid and Cloudflare account credentials.

Before Cloudflare canary traffic or worker execution is enabled, all of the following must hold:

1. exact-SHA CI and release governance pass;
2. container build and runtime contract validation pass;
3. deployed `/api/build-info` matches the exact certified SHA;
4. canary ingress remains fail-closed for mutations and internal routes;
5. worker execution remains disabled until queue lease, retry, idempotency, restart, and authorization checks pass;
6. only one scheduler authority exists;
7. R2 certification and rollback/cutover controls remain intact;
8. production Vercel remains independently certifiable and recoverable.

## Non-goals

This decision does not make Cloudflare the primary web runtime, does not move Supabase state into Cloudflare, does not create active-active schedulers, does not authorize automatic production R2 deletion, and does not activate a paid Cloudflare service by repository merge alone.

## Rollback

Vercel remains the primary runtime throughout canary certification. The durable worker Vault URL can remain pointed at Vercel while Cloudflare worker infrastructure is tested disabled. R2 source copies remain non-destructive until a separately approved reference cutover. These boundaries keep each activation reversible.
