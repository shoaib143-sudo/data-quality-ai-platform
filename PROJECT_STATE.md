# Data Quality AI Platform --- Project State

> Durable project checkpoint. Treat the repository, Supabase migration
> history, and this file as the primary continuity sources.

## 1. Project Identity

- **Project:** `data-quality-ai-platform`
- **Git branch:** `main`
- **GitHub remote:** `https://github.com/shoaib143-sudo/data-quality-ai-platform.git`
- **Production URL:** `https://data-quality-ai-platform.vercel.app`
- **Supabase project ref:** `tvjnavjxuehpesxcfvrx`

## 2. Current Architecture

Primary lifecycle:

```text
Dataset -> Dataset Version -> Profile Run -> Schema Discovery -> Profile Columns
-> Metric Execution -> Metric Results -> Findings Generation -> Quality Score
-> Governance Insights -> Validation
```

Agent execution lifecycle:

```text
Agent Definition -> Agent Run -> Profile Run -> profile_dataset
-> execute_metrics -> investigate_profile -> contract validation
-> Agent Run SUCCEEDED
```

Source onboarding lifecycle:

```text
Dataset -> Dataset Version -> Source Configuration -> Source Connectivity
-> Source Validation -> Schema Availability -> Profiling Ready
```

## 3. Latest Implementation Milestones

Committed on `main`:

- `795b2ba0` source/cancellation hardening
- `fcaafd52` execution-identity validation
- `b2c1aa93` interactive profiling explorer
- `97b97b02` explorer route
- `59ad8c16` end-to-end profiling contract enforcement
- `0d330050` source connectivity/schema validation helper
- `de295821` source validation enforced during dataset registration

The `/agents` page is connected to the live agent registry, displays enabled
tools, supports authenticated execution, persists run history, and links
persisted run details.

## 4. Lane Completion State

### Lane 1 --- Profiling Execution

Implemented canonical dataset/version resolution, schema/profile-column
persistence, metric execution and persistence, execution-identity validation,
cancellation guards, terminal-state preservation, and end-to-end result-contract
enforcement before agent success.

### Lane 2 --- Metric Persistence / Consumer Contract

Implemented metric identity validation using `metric_definition_id +
profile_column_id`, dataset/column scope handling, duplicate identity detection,
unknown definition detection, metric-key consistency checks, and a persisted-run
validation endpoint. Historical runs may still contain legacy inconsistencies;
the validator detects them rather than accepting them.

### Lane 3 --- Findings -> Score -> Investigation

Implemented findings persistence, deterministic quality scoring, investigation
persistence, profiling-agent execution, and final contract validation before
`agent_runs.status = SUCCEEDED`.

### Lane 4 --- Filtering / Drill-down

Implemented the Profiling Explorer route with finding search, severity/type
filters, column drill-down, persisted metric evidence, findings, and score
context.

### Lane 5 --- Source Onboarding Pipeline

Implemented dataset registration, dataset version creation, source binding,
execution-source configuration, file/table routing, source connectivity
validation, schema availability validation, executable FILE source validation,
and profiling-ready handoff only after source validation succeeds.

Bare FILE filenames are rejected unless an executable HTTP(S) URL or Supabase
Storage bucket/path is supplied.

### Lane 6 --- Hardening / Observability

Implemented persisted agent-run logging, project-scoped log access, run history,
persisted run details, cancellation lifecycle guards, failure persistence,
non-blocking log writes, and Vercel runtime/deployment health verification.

## 5. Live Supabase State

The live project is healthy in `ap-southeast-1`.

Current agent registry:

```text
profiling_agent v1.0 -> disabled
profiling_agent v2.0 -> enabled
```

Only Profiling Agent 2.0 is enabled for execution.

The production agent has the expected enabled profiling tools, including:

```text
profile_dataset v2.0
execute_metrics v2.0
investigate_profile v2.0
```

The investigation tool was aligned to version 2.0 through the Supabase migration
`align_profiling_investigation_tool_v2`.

## 6. Source Validation Contract

Dataset registration validates the selected source before creating the
profiling-ready handoff.

FILE/CSV sources require an HTTP(S) URL or Supabase Storage bucket/object path.
TABLE sources require a valid schema, valid table, an existing base table, and a
successful source connectivity/count check.

Validation evidence is persisted into dataset/version/execution-source metadata.

## 7. Security Principles

- Never expose service-role or secret credentials to the browser.
- Preserve organization/project isolation.
- Use authenticated access for normal user-scoped operations.
- Agent runs remain project-scoped.
- Tool execution must be explicitly authorized.
- Do not weaken RLS to make the UI work.
- Keep service/executor access isolated from end-user access.

Existing Supabase security-advisor warnings for public SECURITY DEFINER
functions and leaked-password protection remain security-review items. They
require intent verification before modification.

## 8. Verification Rules

For each meaningful milestone:

```text
1. Inspect repository state
2. Verify relevant live schema/contracts
3. Make the smallest change
4. Run relevant checks
5. Review the diff
6. Commit
7. Push to origin/main
8. Verify the new commit
9. Verify deployment when applicable
10. Update this project state
```

Do not claim deployment or runtime health without evidence.

## 9. Current Verification Baseline

Prior to the latest source-validation commits, Vercel reported the production
deployment for commit `59ad8c164d55420ad23508d7c82ed6ed54552aaa` as `READY`, with
no runtime errors in the selected window. The latest source-validation commits
require a fresh deployment check before they are considered production-verified.

## 10. Remaining Work Policy

The six lanes have reached the integrated implementation checkpoint. Remaining
work is verification, production hardening, or explicitly new capability unless
new evidence identifies a missing implementation contract.

Do not rebuild existing modules from scratch. Any new defect must be fixed at
the smallest affected layer and the complete dependency chain re-checked:

```text
source -> dataset/version -> profile run -> schema/columns -> metrics
-> findings -> score -> investigation -> validation -> agent completion
```
