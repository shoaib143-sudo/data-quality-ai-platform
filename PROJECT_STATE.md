# Data Quality AI Platform --- Project State

> Durable project checkpoint. Treat the repository, Supabase migration history,
and this file as the primary continuity sources.

## 1. Project Identity

- **Project:** `data-quality-ai-platform`
- **Git branch:** `main`
- **GitHub remote:** `https://github.com/shoaib143-sudo/data-quality-ai-platform.git`
- **Production URL:** `https://data-quality-ai-platform.vercel.app`
- **Supabase project ref:** `tvjnavjxuehpesxcfvrx`

## 2. Integrated Lifecycle

```text
Dataset
 -> Dataset Version
 -> Source Configuration
 -> Source Connectivity
 -> Source Validation
 -> Profiling Ready
 -> Profile Run
 -> Schema Discovery
 -> Profile Columns
 -> Metric Execution
 -> Metric Results
 -> Findings Generation
 -> Quality Score
 -> Investigation
 -> Governance Insights
 -> Contract Validation
 -> Agent Run SUCCEEDED
```

## 3. Six-Lane Implementation State

### Lane 1 --- Profiling Execution: COMPLETE

Canonical dataset/version resolution, profile-run lifecycle, schema discovery,
profile-column persistence, deterministic metric execution, source loading,
findings generation, quality scoring, cancellation guards, terminal-state
preservation, and final profiling contract validation are implemented.

### Lane 2 --- Metric Persistence Contract: COMPLETE

Metric persistence is validated by execution identity using
`metric_definition_id + profile_column_id` for column metrics and the null
column identity for dataset metrics. The database now also enforces the
execution identity with `uq_profile_metrics_execution_identity`.

The live registry contains 33 enabled metrics: 5 dataset, 25 column, and
3 distribution metrics.

### Lane 3 --- Findings -> Score -> Investigation: COMPLETE

Deterministic findings, quality scoring, persisted investigation, structured
business-impact interpretation, evidence/limitations, and the Profiling Agent
execution chain are implemented. An agent run cannot become `SUCCEEDED` until
the complete persisted profiling result satisfies the validation contract.

### Lane 4 --- Filtering / Drill-down: COMPLETE

The Profiling Explorer provides finding search, severity/type filters, column
drill-down, persisted metric evidence, findings, and score context.

### Lane 5 --- Source Onboarding Pipeline: COMPLETE

Dataset registration, version creation, source binding, executable source
resolution, FILE/CSV validation, Storage validation, PostgreSQL/Supabase table
validation, and profiling-ready handoff are implemented.

Generic JDBC is now integrated through a governed JDBC bridge abstraction. JDBC
sources require `jdbc_url`, `credential_ref`, schema/table identifiers, and a
server-side `JDBC_BRIDGE_URL` plus `JDBC_BRIDGE_TOKEN` unless a bridge URL is
provided in server-side source configuration. Raw JDBC credentials are rejected.
The bridge contract exposes `/v1/validate` and `/v1/query`, allowing PostgreSQL,
MSSQL, MySQL, Oracle, Databricks, and other JDBC-compatible databases to share
the same profiling connector contract without exposing credentials to agents.

### Lane 6 --- Hardening / Observability: COMPLETE

Persisted agent-run logging, project-scoped access, lifecycle guards, failure
persistence, cooperative cancellation, source-resolution hardening, registry
uniqueness, performance indexes, historical repair auditing, and production
smoke verification are implemented.

## 4. Live Agent Registry

```text
profiling_agent v1.0 -> disabled
profiling_agent v2.0 -> enabled
```

Enabled production profiling tools:

```text
profile_dataset v2.0
execute_metrics v2.0
investigate_profile v2.0
```

## 5. Database and Historical Data Hardening

Applied migrations include:

```text
20260902194437_harden_agent_registry_uniqueness
20260903000000_harden_performance_and_historical_metrics
20260903000001_complete_profiling_performance_indexes
```

The historical repair normalized the known legacy dataset-metric identity error:
15 canonical dataset metric rows were retained and 10 duplicate rows removed,
with every action recorded in `profiling.metric_repair_audit`.

The known incomplete historical run was reclassified from `COMPLETED` to
`PARTIAL` rather than being deleted or silently fabricated.

Post-repair verification reports zero duplicate execution identities and zero
invalid dataset metric rows carrying a profile-column identity.

Performance hardening removed the exact duplicate indexes reported by the
Supabase advisor and added coverage for the `profile_anomalies.metric_definition_id`
foreign key. Remaining advisor output is limited to informational unused-index
notices and the intentionally synthetic validation table without a primary key.

## 6. Security Boundary

- Service-role credentials remain server-side.
- Normal user operations preserve organization/project isolation.
- Agent runs are project-scoped.
- Tool execution is server-side and tied to an enabled registered agent.
- JDBC raw passwords/secrets are rejected from source configuration.
- JDBC credentials are referenced by `credential_ref` and resolved by the bridge.
- Cancellation cannot reactivate a terminal run.
- Production data modification, deletion, schema changes, remediation execution,
and governance-policy changes remain approval-gated.

Supabase security-advisor warnings for SECURITY DEFINER functions and leaked
password protection remain explicit security-review items because changing them
requires confirming the intended authentication model.

## 7. Production Verification

Latest implementation commits are pushed to GitHub `main` and Vercel Git
integration deploys them automatically.

Production smoke verification is available through:

```text
pnpm verify:production
```

The verifier checks the production login surface and confirms that protected
profiling, validation, dataset-registration, and agent APIs reject unauthenticated
requests. It also supports authenticated profiling-contract verification when
`VERIFY_COOKIE` and `VERIFY_PROFILE_RUN_ID` are supplied.

The latest verified production deployment must always be independently checked
as `READY` after new commits before being called production-verified.

## 8. Completion Policy

The six original implementation lanes and the requested dependency-aware
hardening increment are complete. Future work should be treated as:

- authenticated E2E execution against real source fixtures
- deployment/runtime regression testing
- security remediation after authentication-model confirmation
- provisioning a production JDBC bridge and its credential store
- additional connector-specific optimizations
- performance optimization based on measured workload
- new product capability

Do not rebuild completed modules. Any newly discovered defect must be fixed at
the smallest affected layer and the full dependency chain re-checked.
