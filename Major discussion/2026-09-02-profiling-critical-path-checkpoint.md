# Profiling Critical Path Checkpoint

Date: 2026-09-02

## Purpose

Durable checkpoint for the profiling critical path. This records implementation state and decisions without storing private model reasoning.

## Current lifecycle

```text
Dataset
  -> Dataset Version
  -> Profile Run
  -> Schema Discovery
  -> Profile Columns
  -> Metric Execution
  -> Metric Results
  -> Findings Generation
  -> Quality Score
  -> Investigation
  -> Governance Insights
  -> Validation
```

The current implemented agent execution path is:

```text
profile_dataset
  -> execute_metrics
  -> investigate_profile
```

Investigation is a dedicated agent step rather than part of metric execution.

## Current implementation state

### Metric execution

`lib/profiling/metric-engine.ts` is intact after recovery. The current implementation:

- verifies the profiling run exists
- verifies the profiling run belongs to the supplied dataset version
- refuses to execute against a cancelled profiling run
- loads source rows through the executable source configuration
- calculates deterministic column metrics
- persists profile metrics
- persists findings
- persists the deterministic quality score
- preserves existing `profile_runs.summary` fields, including a persisted investigation
- guards the final profiling-run summary update against cancellation or dataset-version races

The metric engine remains evidence-first and deterministic.

### Investigation

`lib/profiling/investigation-engine.ts` provides the first Data Profiling Investigation Agent implementation.

It produces structured evidence-first interpretation covering:

- technical summary
- finding summary
- probable root causes
- business issue
- business impact
- risk
- recommendations
- approval requirements
- confidence
- evidence
- limitations

Optional OpenAI-compatible model enrichment is supported through `lib/ai/investigation-model.ts`. If a model is not configured, deterministic investigation remains available. Provider failure does not fail the entire profiling run.

Investigation persistence is protected against stale, changed, or cancelled profiling runs.

### Agent execution

`app/api/agents/run/route.ts` executes the profiling workflow as explicit steps:

1. `profile_dataset`
2. `execute_metrics`
3. `investigate_profile`

Cancellation is cooperative. Terminal cancellation state is protected from executor reactivation by a database trigger.

### Persistence

Investigation output is persisted into `profiling.profile_runs.summary.investigation` and is also synchronized by the database persistence trigger for agent-run output.

### Source onboarding

The source path remains:

```text
Dataset
  -> Dataset Version
  -> Source Configuration
  -> Source Connectivity
  -> Source Validation
  -> Schema Availability
  -> Profiling Ready
```

Initial executable sources remain CSV/file and PostgreSQL/Supabase table sources.

## Production verification

The Vercel project is connected to GitHub and the latest production deployment for commit `4880a846924d48729eed446aeaafcb045f388dd8` is READY.

The production deployment includes the recovered complete metric engine and investigation hardening currently present on `main`.

The latest 24-hour production runtime-error query returned no error logs. Historical runtime errors involving the old `agent.agent_run_logs` table were observed before the log implementation was corrected and are not present in the latest 24-hour window.

## Recovery note

An earlier metric-engine write was accidentally truncated during implementation. The repository was recovered by restoring the complete metric-engine source blob and removing the temporary recovery note. The current `main` file was re-read from its live Git blob and is complete.

The attempted hardening from the truncated write was not relied upon. The current complete metric engine already contains the important active-run validation, summary preservation, persistence error checks, and cancellation-safe final update shown above.

## Next implementation priority

Continue hardening the profiling critical path without rebuilding the architecture.

Priority order:

1. Make metric-result and finding persistence transaction-safe so partial persistence cannot leave a run in an inconsistent state.
2. Add explicit metric-definition contract validation so missing registered definitions cannot silently reduce persisted metrics.
3. Add end-to-end authenticated profiling verification covering CSV and PostgreSQL/Supabase table sources.
4. Validate cancellation races across metric execution and investigation.
5. Connect the resulting investigation and business-impact outputs to the user-facing Data Quality and AI Operations Center experience.

## Governance boundary

Autonomous investigation may explain, classify, detect, predict, and recommend within policy boundaries. Production data modification, deletion, schema changes, remediation execution, governance-policy changes, and production-pipeline changes remain approval-gated.
