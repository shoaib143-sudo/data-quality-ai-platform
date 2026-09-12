-- Cover replay foreign keys used by profiling replay lookups without removing
-- any existing workload indexes. This migration is additive and idempotent.

create index if not exists profile_dataset_replays_dataset_version_fk_idx
  on profiling.profile_dataset_replays(dataset_version_id);

create index if not exists profile_investigation_replays_dataset_version_fk_idx
  on profiling.profile_investigation_replays(dataset_version_id);

create index if not exists profile_metric_execution_replays_dataset_version_fk_idx
  on profiling.profile_metric_execution_replays(dataset_version_id);
