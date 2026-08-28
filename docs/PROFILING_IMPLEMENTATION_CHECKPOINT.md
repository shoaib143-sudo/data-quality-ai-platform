# Profiling Implementation Checkpoint

Date: 2026-08-28

## Current truth

The profiling implementation, persistence layer, agent executor and dataset execution source registry are present on `main`.

The current dataset version under investigation is registered as `FILE / demo.csv` in `profiling.dataset_execution_sources`. The source has `execution_config = {}`. There is no matching `storage.objects` record for `demo.csv`, and the dataset version currently has no rows in `profiling.dataset_execution_registry` or `profiling.dataset_row_access_registry`.

## Implementation completed

1. Added `lib/profiling/metric-engine.ts`.
2. Added deterministic column metrics for null, distinct, unique and rate measures.
3. Added deterministic email, phone, SSN and address pattern and sensitivity detection.
4. Added candidate key confidence calculation.
5. Added deterministic completeness, uniqueness and validity score components.
6. Added persistence of metrics, findings and quality score.
7. Rounded rates and confidence values to 4 decimal places.
8. Added explicit failure for FILE sources that have no executable storage or HTTP configuration, rather than silently persisting NULL metrics.
9. Wired `execute_metrics` through `lib/agents/executors/profiling-executor.ts`.
10. Added `lib/profiling/file-source-adapter.ts` supporting HTTPS CSV sources and Supabase Storage objects.
11. Added CSV parsing with quoted-field support, sampling limits, byte limits and SHA-256 content hashing.
12. Added `profiling.get_dataset_execution_source(uuid)` and an active-source uniqueness invariant through migration `20260826000000_harden_file_execution_sources.sql`.
13. Merged the implementation into `main` through PR #1.

## Runtime contract

FILE sources must provide one of the following:

* `execution_config.url` containing an HTTP(S) CSV URL, or
* `execution_config.bucket` plus `execution_config.path` identifying a Supabase Storage object.

A bare `source_uri` such as `demo.csv` is not treated as an executable physical location. This is intentional and prevents false successful runs with empty or NULL metrics.

## Remaining live acceptance checkpoint

The code implementation is complete for the supported FILE execution forms. The remaining blocker is live environment configuration and migration execution for the investigated dataset:

* Apply `20260826000000_harden_file_execution_sources.sql` to Supabase project `tvjnavjxuehpesxcfvrx`.
* Configure the physical FILE source for `demo.csv` using a supported execution configuration.
* Execute the existing 100-row, 3-column acceptance dataset end to end.
* Verify populated metrics, deterministic findings, persisted quality score and a terminal `COMPLETED` profile run.

The application must not hardcode the dataset location or credentials to bypass this checkpoint.

## Acceptance criteria

* 100-row demo dataset executes end to end.
* Three columns are profiled.
* Metric numeric values are populated rather than NULL.
* Rates and confidence values are persisted to 4 decimal places.
* Findings are deterministic and explainable.
* Quality score is persisted.
* Profile run completes or fails explicitly with an execution error.
* No hardcoded dataset table, file path or credentials are introduced.
