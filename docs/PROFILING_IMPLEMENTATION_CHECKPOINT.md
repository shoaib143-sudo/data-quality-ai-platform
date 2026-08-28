# Profiling Implementation Checkpoint

Date: 2026-08-28

## Current truth

The live project contains the profiling foundation, persistence layer, agent executor and dataset execution source registry. The current dataset version under investigation is registered as `FILE / demo.csv`.

The database currently has no matching `storage.objects` record for `demo.csv`, no row in `profiling.dataset_execution_registry`, and no row in `profiling.dataset_row_access_registry`. `profiling.dataset_execution_sources` does contain an active FILE source for the dataset version, but `execution_config` is empty.

## Implementation completed in this checkpoint

1. Added `lib/profiling/metric-engine.ts`.
2. Added deterministic column metrics for null, distinct, unique and rate measures.
3. Added deterministic email/phone/SSN/address pattern and sensitivity detection.
4. Added candidate key confidence calculation.
5. Added deterministic completeness, uniqueness and validity score components.
6. Added persistence of metrics, findings and quality score.
7. Rounded rates and confidence values to 4 decimal places.
8. Added explicit failure for FILE sources that have no executable storage/HTTP configuration, rather than silently persisting NULL metrics.
9. Wired `execute_metrics` through `lib/agents/executors/profiling-executor.ts`.

## Safety decision

Do not merge this checkpoint into `main` until the source adapter contract is completed and the live `FILE / demo.csv` source is made executable. The engine supports table sources and explicit `input.rows`; it intentionally does not guess a physical file location.

## Next implementation checkpoint

Implement a production FILE adapter with one of the approved source forms:

* Supabase Storage bucket + object path
* HTTPS source URL
* another explicitly configured connector supported by the execution source model

Then wire that adapter into the metric engine so the live dataset version can execute without caller-supplied rows.

## Acceptance criteria

* 100-row demo dataset can execute end to end.
* Three columns are profiled.
* Metric numeric values are populated rather than NULL.
* Rates and confidence values are persisted to 4 decimal places.
* Findings are deterministic and explainable.
* Quality score is persisted.
* Profile run completes or fails explicitly with an execution log.
* No hardcoded dataset table or credentials are introduced.
