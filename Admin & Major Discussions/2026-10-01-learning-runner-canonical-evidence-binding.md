# Learning runner canonical evidence binding

Date: 2026-10-01

## Scope

This stacked module extends the durable paired experiment runner core with the existing canonical DataNexus run/artifact contracts.

It adds:

- one canonical `agent.agent_runs` row per experiment case/arm attempt;
- the experiment `run_id` as a foreign key to that canonical run;
- QUEUED run creation atomically during experiment preparation;
- immutable experiment provenance in the canonical run input;
- completion through the existing content-addressed `AGENT_RUN_RESULT` artifact contract;
- exact artifact ID + SHA-256 binding back to the experiment attempt;
- exact budget reservation + ACCOUNTED settlement + cost-event binding for non-synthetic completion;
- delayed accounting reconciliation that transitions `RECONCILIATION_REQUIRED -> COMPLETED` without provider redispatch;
- exact terminal retry idempotency and conflicting-evidence rejection.

## Reused platform contracts

No new output store is introduced.

The runner reuses:

- `agent.agent_runs`;
- `agent.agent_artifacts`;
- `agent.persist_agent_run_result(...)`;
- the existing 7-year artifact retention contract;
- `agent.learning_experiment_budget_reservations`;
- `agent.learning_experiment_budget_settlements`;
- `governance.ai_model_cost_events`.

## Safety invariants

- Preparation creates a QUEUED canonical run but does not execute it.
- The coordinator registers no live executor or provider adapter.
- A COMPLETED attempt must reference the canonical artifact from the same run.
- A foreign-run artifact is rejected.
- A completed agent run must be `SUCCEEDED` with persisted output.
- Non-synthetic completion without canonical accounting becomes `RECONCILIATION_REQUIRED`.
- Reconciliation consumes existing run/artifact/accounting evidence only; it cannot re-dispatch.
- Synthetic attempts cannot bind live budget or cost evidence.
- Conflicting terminal evidence cannot rewrite a completed attempt.
- Artifact persistence conflicts fail closed.
- A failure after artifact persistence but before experiment binding is recoverable through evidence reconciliation, not re-execution.

## Tests

Service-level:
- successful canonical artifact persistence and v2 binding;
- missing structured output rejection;
- artifact integrity/persistence failure;
- database binding rejection after artifact persistence;
- delayed reconciliation service call without artifact repersistence.

Database-level:
- preparation creates canonical QUEUED agent run;
- run provenance matches immutable attempt scope;
- real `persist_agent_run_result` creates the result artifact and marks run SUCCEEDED;
- artifact hash is bound to the attempt;
- foreign artifacts are rejected;
- exact terminal retry remains idempotent;
- accounted non-synthetic completion succeeds;
- delayed accounting enters `RECONCILIATION_REQUIRED`, then resolves to COMPLETED;
- dispatch cardinality remains one across delayed reconciliation.

## Remaining implementation

This module still does not provide a live prospective experiment.

Subsequent safe slices remain:
1. replayable immutable source/input loader;
2. concrete governed runtime adapter that uses the prepared canonical run ID;
3. independent evaluator adapter over persisted artifact evidence;
4. aggregate evidence collector deriving sample counts, quality/safety/accounting totals and confidence statistics from canonical rows;
5. fully synthetic end-to-end baseline/candidate/evaluator trajectory.

Real provider/model configuration, nonzero spend, genuine evaluator assignment, candidate selection, live deployment, canary and promotion remain separate decision boundaries.
