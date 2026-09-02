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

Generic JDBC is integrated through a governed bridge abstraction. JDBC sources
require `jdbc_url`, `credential_ref`, schema/table identifiers, and the
server-managed `JDBC_BRIDGE_URL` plus `JDBC_BRIDGE_TOKEN`. Source configuration
cannot override the bridge destination, preventing a database-backed record from
turning the server into an arbitrary outbound HTTP proxy. Raw JDBC credentials
are rejected.

The bridge contract exposes `/v1/validate` and `/v1/query`. The initial bridge
image includes PostgreSQL, MSSQL, and MySQL JDBC drivers; additional JDBC drivers
can be added without changing the DataNexus application contract.

### Lane 6 --- Hardening / Observability: COMPLETE

Persisted agent-run logging, project-scoped access, lifecycle guards, failure
persistence, cooperative cancellation, source-resolution hardening, registry
uniqueness, performance indexes, historical repair auditing, RLS protection for
the repair audit table, production smoke verification, bounded production
latency benchmarking, and JDBC security/test coverage are implemented.

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
20260902195211_harden_performance_and_historical_metrics
20260902195412_complete_profiling_performance_indexes
20260902195726_secure_metric_repair_audit
20260902195755_reclassify_incomplete_historical_profiling_runs
20260903230000_restrict_security_definer_rpc_execute
20260903230500_close_public_profiling_rpc_execute_grant
```

The historical repair normalized the known legacy dataset-metric identity error:
15 canonical dataset metric rows were retained and 10 duplicate rows removed,
with every action recorded in `profiling.metric_repair_audit`.

Two historical runs that did not satisfy the current execution contract are now
explicitly `PARTIAL` rather than falsely represented as successful completions.
No historical evidence was fabricated or deleted.

Post-repair verification reports zero duplicate metric execution identities and
zero invalid dataset metric rows carrying a profile-column identity. The remaining
`COMPLETED` run validates successfully with 3 profile columns, 75 column metric
rows, 5 dataset metric rows, and 9 distribution metric rows.

Performance hardening removed exact duplicate indexes previously reported by the
Supabase advisor and added coverage for the anomaly metric foreign key. The new
repair audit foreign keys are indexed and the audit table has RLS enabled.
Remaining performance advisor output is limited to informational unused-index
notices and the intentionally synthetic validation table without a primary key.

## 6. Security Boundary

- Service-role credentials remain server-side.
- Normal user operations preserve organization/project isolation.
- Agent runs are project-scoped.
- Tool execution is server-side and tied to an enabled registered agent.
- JDBC raw passwords/secrets are rejected from source configuration.
- JDBC credentials are referenced by `credential_ref` and resolved by the bridge.
- The JDBC bridge destination is server-managed and cannot be supplied by source metadata.
- JDBC bridge requests require a constant-time bearer-token comparison.
- Infisical Machine Identity tokens are short-lived, cached in memory, refreshed before expiry, and explicitly invalidated after HTTP 401.
- Infisical authentication and credential-store failures do not echo response bodies or secret values.
- Cancellation cannot reactivate a terminal run.
- Production data modification, deletion, schema changes, remediation execution,
and governance-policy changes remain approval-gated.
- SECURITY DEFINER authorization helpers and profiling metadata RPCs are no
  longer executable by `anon` or `authenticated` through PostgREST.

The remaining Supabase security-advisor warning is leaked-password protection.
The RLS-without-policy notices are informational and intentionally preserve a
default-deny posture on internal tables. Leaked-password protection requires
Auth configuration access and should be enabled before password-based production
onboarding.

## 7. Production Verification

Latest GitHub `main` commits are automatically deployed through Vercel when the
Vercel build quota permits deployment.

The production smoke verifier checks `/login` plus protected POST-only API
method/auth boundaries. When `JDBC_BRIDGE_URL` is supplied to the verifier, it
also checks bridge health and confirms the unauthenticated `/v1/query` boundary
returns 401. Authenticated profiling-contract verification remains optional and
uses `VERIFY_COOKIE` and `VERIFY_PROFILE_RUN_ID` without logging either value.

A bounded production latency benchmark is available through:

```text
pnpm benchmark:production
```

It defaults to 25 requests with concurrency 5 against `/login` and fails on
transport errors or unexpected status codes. It is deliberately bounded and
must not be treated as a substitute for authenticated profiling load tests.

## 8. JDBC Bridge Automated Test Coverage

The Java bridge has automated coverage for:

- Infisical Universal Auth success and token caching
- short-lived token refresh
- explicit token invalidation
- concurrency-safe single-flight token refresh
- HTTP 401 credential-store retry with fresh Machine Identity authentication
- missing Infisical project/auth configuration
- invalid credential references
- secret-safe authentication failures
- JDBC URL and embedded-credential rejection
- unsafe schema/table identifier rejection
- bridge bearer authentication
- public health endpoint
- 10,000-row query ceiling

The bridge test suite uses an H2 test-only dependency and local HTTP fixtures, so
it does not require real Infisical or database credentials in CI.

## 9. Remaining Production Activation Work

The application implementation and automated bridge coverage are complete.
Remaining work is external or environment-dependent:

- provision and operate the JDBC bridge and credential store
- provide real connector fixtures/credentials for authenticated E2E
- enable Supabase leaked-password protection through the Auth configuration
- run authenticated E2E across the complete profiling lifecycle
- run connector-specific integration/load tests against PostgreSQL, MSSQL,
  MySQL and later Oracle/Databricks JDBC drivers as they are provisioned
- execute measured production benchmark runs and tune workloads from evidence

The generic JDBC code path is complete at the application boundary and is
security-pinned to the deployment-managed bridge. A real bridge deployment and
credential-store configuration are still required to connect to an external
JDBC database. This is an infrastructure provisioning dependency, not an
unimplemented application path.

Do not rebuild completed modules. Any newly discovered defect must be fixed at
the smallest affected layer and the full dependency chain re-checked.
