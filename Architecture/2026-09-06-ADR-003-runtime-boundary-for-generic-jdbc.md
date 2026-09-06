# ADR-003: Runtime Boundary for Generic JDBC Connectivity

**Date:** 2026-09-06  
**Status:** Accepted for current productionization phase  
**Architecture version:** 1.3

## Decision summary

DataNexus AI will keep the primary application on **Vercel** and run the **generic JDBC bridge as a separate containerized Java service**, currently on **Render**.

This is a runtime-boundary decision, not a permanent vendor lock-in decision.

The logical contract is:

```text
DataNexus on Vercel
        │
        │ HTTPS + bearer token
        ▼
Generic JDBC Bridge
(currently Render)
        │
        ├── PostgreSQL JDBC
        ├── SQL Server JDBC
        ├── MySQL / MariaDB JDBC
        ├── Oracle JDBC
        ├── Snowflake JDBC
        ├── Redshift JDBC
        ├── Databricks JDBC where required
        └── future JVM JDBC drivers
```

Vercel remains the application/control-plane runtime. The generic JDBC bridge is an isolated data-plane service.

## Why this decision exists

The generic JDBC bridge is implemented as a Dockerized Java 21 / Spring Boot service with JVM JDBC drivers. Its workload characteristics differ from the Next.js application hosted on Vercel:

- long-lived JVM process;
- large JDBC driver dependencies;
- connection pooling and connection lifecycle management;
- potentially long-running metadata discovery and profiling calls;
- enterprise JDBC driver compatibility;
- future private-network, VPN, static-egress-IP or peering requirements;
- independent scaling and failure isolation from the user-facing application.

Trying to embed the Java bridge inside the Vercel application would couple two very different runtime models and reduce replaceability.

## Current physical deployment

### Vercel

Hosts:

- Next.js / React application;
- application APIs;
- Supabase control-plane integration;
- native Databricks integration;
- calls to the generic JDBC bridge when a source requires it.

### Render

Hosts:

- `services/jdbc-bridge`;
- Java 21 / Spring Boot;
- JVM JDBC drivers;
- bridge authentication;
- server-side database credential resolution;
- generic relational metadata/query operations.

Render is the current deployment target because it can run the Dockerized bridge with minimal additional infrastructure. The bridge contract must remain portable to another container runtime.

## Replaceability requirement

DataNexus must not depend on Render-specific application semantics.

The application-side contract is intentionally narrow:

```text
JDBC_BRIDGE_URL
JDBC_BRIDGE_TOKEN
```

The same bridge may later move to:

- AWS ECS/Fargate;
- AWS App Runner;
- Google Cloud Run;
- Azure Container Apps;
- Railway;
- Fly.io;
- Kubernetes;
- an internal VM or private server.

Moving the bridge should not require changes to governance authority, metadata identity, lineage truth, or application-domain models.

## Credential decision for the current infrastructure constraint

The preferred long-term model remains a dedicated secret manager. However, the current environment cannot yet use the planned secret/config mechanism.

A temporary **server-side environment credential mode** is therefore accepted for the JDBC bridge.

Required runtime variables are:

```text
JDBC_CREDENTIAL_MODE=environment
JDBC_CREDENTIAL_REF=primary-jdbc
JDBC_CREDENTIAL_USERNAME=<server-side database user>
JDBC_CREDENTIAL_PASSWORD=<server-side database password>
JDBC_BRIDGE_TOKEN=<server-side bridge token>
```

Security constraints:

1. Username/password remain server-side deployment variables.
2. Passwords must not be committed to Git.
3. Passwords must not be exposed through browser code or `NEXT_PUBLIC_*` variables.
4. Passwords must not be placed in JDBC URLs.
5. Passwords must not be persisted in DataNexus governance/catalog tables as ordinary configuration.
6. Credential mutation APIs are disabled in environment mode.
7. The database account should be read-only or least-privilege for discovery/profiling wherever possible.
8. The bridge token is separate from database credentials and is shared only between the DataNexus server runtime and the bridge.

This mode is explicitly transitional. When infrastructure permits, credential resolution should move back to a managed secret store without changing connector-domain contracts.

## Multi-schema and multi-table requirement

The JDBC bridge must support discovery and profiling across multiple schemas and tables through one connection where the database account is authorized to read them.

Schema/table scope is a governance/discovery selection concern, not a reason to create one bridge instance per schema.

The implementation must preserve source-qualified identity so assets from multiple catalogs/schemas cannot collide.

## Failure-isolation requirement

A generic JDBC bridge outage must not make the DataNexus control plane unavailable.

Expected behavior:

- Vercel application remains available;
- native PostgreSQL and Databricks paths remain independently usable where configured;
- generic JDBC health becomes `DEGRADED` rather than corrupting governance state;
- no governance authority is fabricated when a source cannot be reached.

## Current deployment incident and resulting control

The first Render deployment built its Docker image successfully but failed during Spring startup because `CredentialStore` had multiple constructors and Spring attempted default construction.

The incident established two additional requirements:

1. JDBC CI must include a full Spring application-context startup smoke test, not only unit tests and packaging.
2. Container build warnings and application startup failures must be distinguished. The UID warning seen during the first build was non-fatal; the Spring bean wiring error was the actual failure.

## Consequences

### Benefits

- preserves Vercel as the stable application runtime;
- keeps JVM/JDBC complexity isolated;
- preserves broad enterprise JDBC-driver compatibility;
- enables independent scaling and network placement;
- keeps the bridge replaceable;
- prevents JDBC-specific runtime failures from destabilizing the governance control plane.

### Costs

- one additional deployable service;
- one additional health/security boundary;
- bridge URL/token configuration between Vercel and the container runtime;
- temporary environment-secret operational burden until a dedicated secret manager is available.

## Explicit non-decisions

This ADR does **not**:

- require Render permanently;
- move DataNexus itself away from Vercel;
- make the JDBC bridge authoritative for governance state;
- allow passwords in Git, URLs, browser code or ordinary database configuration;
- alter the native Databricks connector;
- alter Module #3 lineage truth or work around missing Databricks `system.access` permissions.

## Revisit triggers

Revisit this ADR when any of the following becomes true:

- private networking or fixed egress is required;
- JDBC workload volume justifies autoscaling or pooling changes;
- organizational infrastructure standardizes on another container platform;
- a managed secret system becomes available;
- supported database engines can be served more safely by native provider APIs than JDBC;
- latency or cost data shows the current deployment is no longer appropriate.
