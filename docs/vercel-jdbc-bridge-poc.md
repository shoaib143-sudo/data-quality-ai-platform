# Vercel JDBC Bridge Proof-of-Fit

## Objective

Determine whether Vercel's container runtime can replace the current Render-hosted generic JDBC bridge for publicly reachable database sources without changing the DataNexus JDBC contract or production traffic.

**Production JDBC_BRIDGE_URL remains unchanged throughout this proof-of-fit.**

## Why this is a PoC rather than a migration

The production application is not currently failing because of JDBC business logic. The observed readiness degradation came from the existing Render Free service sleeping. The generic bridge is needed for reliable non-native JDBC engines, but a runtime migration is not urgent enough to justify an untested production cutover.

The current Render service remains the rollback/fallback runtime until this PoC passes all gates.

## Existing bridge characteristics

- Java 21 / Spring Boot 3.
- Dockerized and non-root.
- Binds to the platform-provided PORT.
- Stateless request/response service.
- Database connections are opened per request and forced read-only.
- Credentials are resolved server-side from Infisical or constrained environment mode.
- Supported engine families include PostgreSQL, SQL Server, MySQL, MariaDB, Databricks, Snowflake, Redshift, Oracle, SQLite and Generic JDBC.

## Vercel PoC configuration

The service root contains Dockerfile.vercel and a dedicated vercel.json.

The PoC configuration:

- uses Vercel Fluid compute;
- preserves Java 21;
- runs as UID 10001;
- uses the existing Spring Boot application and PORT contract;
- disables automatic Git deployments;
- does not modify the main DataNexus Vercel project's JDBC_BRIDGE_URL;
- does not create production traffic or remove Render.

## Acceptance gates

1. Container build — Maven tests and both Dockerfiles build successfully.
2. Health contract — GET /health returns HTTP 200, service datanexus-jdbc-bridge, and at least ten engine families.
3. Cold/readiness latency — a genuinely cold PoC instance must answer /health inside the DataNexus 5-second readiness budget. Warm-only success is insufficient.
4. Authentication — protected /v1/* routes return 401 without the bridge bearer token.
5. Payload safety — /v1/query truncates safely before the transport response ceiling and emits an explicit warning.
6. Read-only behavior — existing JDBC tests must continue to prove read-only connections and credential rejection.
7. Public JDBC connectivity — at least PostgreSQL plus one additional non-native JDBC engine must pass catalog, validate and query against a publicly reachable test target.
8. Credential isolation — Infisical/environment credentials remain server-side; no password or token appears in JDBC URLs, retained evidence or logs.
9. No deployment fan-out — automatic Git deployment remains disabled; PoC deployment and probing are explicit/manual.
10. No production cutover — production JDBC_BRIDGE_URL is changed only after all gates pass and rollback is prepared.

## Networking boundary

This PoC certifies only databases reachable from ordinary Vercel container egress.

**Private or allowlisted database connectivity is not certified by this PoC.** That includes private VPC/VPN endpoints, on-premise databases, and databases requiring a stable source IP unless the exact Vercel container networking capability is independently validated for the target plan and architecture.

Failure of this gate does not imply the JDBC bridge is defective; it means Vercel is not sufficient as the universal enterprise JDBC runtime.

## Response-size protection

Vercel documents a 4.5 MB function response limit. The bridge now uses a lower default serialized-row budget of 3.5 MB and stops adding rows before the budget is exceeded. The response includes a warning instructing the caller to use a smaller sample or narrower projection.

The existing row ceiling remains a separate technical safety boundary.

## Live probe

A manually deployed PoC can be checked by setting VERCEL_JDBC_BRIDGE_URL and VERCEL_JDBC_BRIDGE_MAX_HEALTH_MS, then running:

    node scripts/probe-vercel-jdbc-bridge-poc.mjs

The probe checks public health, latency, engine-family advertisement, root status and fail-closed unauthenticated API behavior. It does not mutate a database.

A workflow-dispatch invocation of the existing JDBC Bridge workflow can run the same probe against an explicitly supplied PoC URL.

## Cutover decision

A Vercel cutover is permitted only after all static/unit/container gates pass, a cold-start test passes repeatedly, public PostgreSQL and one second JDBC engine pass, response-budget tests pass, no credential leakage is observed, the target networking requirement is supported, and a rollback URL/token remains available.

If any networking gate fails, retain the existing runtime or evaluate another container platform rather than weakening customer database network controls.
