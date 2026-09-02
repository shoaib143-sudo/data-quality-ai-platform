# Data Quality AI Platform --- Project State

> Durable project checkpoint. Treat the repository, Supabase migration history,
> and this file as the primary continuity sources.

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

Implemented canonical dataset/version resolution, profile-run lifecycle,
schema discovery/profile-column persistence, deterministic metric execution,
source loading, findings generation, quality scoring, cancellation guards,
terminal-state preservation, and final profiling contract validation.

### Lane 2 --- Metric Persistence Contract: COMPLETE

Metric persistence is validated by execution identity rather than by metric
definition alone. The contract uses `metric_definition_id + profile_column_id`
for column metrics and the correct null column identity for dataset metrics.
Unknown definitions, unsupported enabled definitions, unregistered source
columns, and invalid persisted result sets are rejected.

The live registry currently contains 33 enabled metrics: 5 dataset, 25 column,
and 3 distribution metrics.

### Lane 3 --- Findings -> Score -> Investigation: COMPLETE

Implemented deterministic findings, quality scoring, persisted investigation,
structured business-impact interpretation, evidence/limitations, and the
Profiling Agent execution chain:

```text
profile_dataset -> execute_metrics -> investigate_profile -> validation
```

An agent run cannot become `SUCCEEDED` until the complete persisted profiling
result satisfies the validation contract.

### Lane 4 --- Filtering / Drill-down: COMPLETE

Implemented the Profiling Explorer with finding search, severity/type filters,
column drill-down, persisted metric evidence, findings, and score context.

### Lane 5 --- Source Onboarding Pipeline: COMPLETE

Implemented:

- dataset registration
- dataset version creation
- source binding/configuration
- executable source resolution
- FILE/CSV source validation
- Supabase Storage object validation
- TABLE source schema/identifier validation
- TABLE source connectivity and row-count validation
- profiling-ready handoff only after source validation succeeds

Bare FILE filenames are rejected unless an executable HTTP(S) URL or Supabase
Storage bucket/object path is supplied.

Initial supported executable table sources are PostgreSQL/Supabase table
sources. The architecture remains extensible for additional connectors.

### Lane 6 --- Hardening / Observability: COMPLETE

Implemented persisted agent-run logging, project-scoped log access, persisted
run details, step lifecycle guards, failure persistence, cooperative
cancellation, non-blocking logging, source-resolution hardening, and deployment
health verification.

Agent registry hardening now also enforces a single enabled version per logical
agent key and a single enabled implementation per tool key within an agent.

## 4. Live Agent Registry

Verified live Supabase state:

```text
profiling_agent v1.0 -> disabled
profiling_agent v2.0 -> enabled
```

Production execution is restricted to Profiling Agent 2.0.

The enabled production profiling tools include:

```text
profile_dataset v2.0
execute_metrics v2.0
investigate_profile v2.0
```

The investigation tool was aligned to v2.0 by migration
`20260902193846_align_profiling_investigation_tool_v2`.

## 5. Database Hardening

Applied live migration:

```text
20260902194437_harden_agent_registry_uniqueness
```

It adds partial unique indexes enforcing:

```text
one enabled agent version per agent_key
one enabled tool implementation per (agent_definition_id, tool_key)
```

Live verification shows no duplicate enabled metric definitions, agent versions,
or tool implementations.

## 6. Persistence and Historical Data

Metric-result persistence is atomic through the existing profiling persistence
RPC. Findings and score persistence occur in the same persistence operation.

Historical completed profiling runs may contain legacy metric-row inconsistencies
under the corrected execution-identity contract. These are detected by the
validator and are not silently rewritten.

## 7. Security Boundary

- Service-role credentials remain server-side.
- Normal user operations preserve organization/project isolation.
- Agent runs are project-scoped.
- Tool execution is server-side and tied to an enabled registered agent.
- Cancellation cannot reactivate a terminal run.
- Production data modification, deletion, schema changes, remediation execution,
and governance-policy changes remain approval-gated.

Supabase security-advisor warnings for SECURITY DEFINER functions and leaked
password protection remain explicit security-review items because changing them
requires confirming the intended authentication model. They are not treated as
implementation failures of the six profiling lanes.

## 8. Verification State

GitHub `main` contains the complete implementation through the registry-hardening
migration and the refreshed project checkpoint.

The latest Vercel deployments generated from these commits are being tracked
through the Git integration. The previously verified production deployment for
`a0c79b89` completed successfully with TypeScript and Next.js production build
checks and no runtime errors. New commits require their own READY verification
before being called production-verified.

## 9. Completion Policy

The six lanes are now at the integrated implementation-complete checkpoint.
Future work should be treated as:

- production hardening
- authenticated end-to-end test expansion
- security remediation after intent confirmation
- connector expansion
- performance optimization
- new product capability

Do not rebuild completed modules. Any newly discovered defect must be fixed at
the smallest affected layer and the full dependency chain re-checked.
