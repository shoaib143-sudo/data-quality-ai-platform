CREATE TABLE IF NOT EXISTS profiling_run_history
(
  project_id UUID,
  event_id UUID,
  event_type LowCardinality(String),
  profile_run_id String,
  dataset_id String,
  dataset_version_id String,
  status LowCardinality(String),
  engine_name String,
  engine_version String,
  occurred_at DateTime64(3, 'UTC'),
  payload_json String,
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, profile_run_id, occurred_at, event_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_profiling_run_history
TO profiling_run_history
AS
SELECT
  project_id,
  event_id,
  event_type,
  aggregate_id AS profile_run_id,
  JSONExtractString(payload_json, 'datasetId') AS dataset_id,
  JSONExtractString(payload_json, 'datasetVersionId') AS dataset_version_id,
  JSONExtractString(payload_json, 'status') AS status,
  JSONExtractString(payload_json, 'engineName') AS engine_name,
  JSONExtractString(payload_json, 'engineVersion') AS engine_version,
  occurred_at,
  payload_json,
  ingested_at
FROM analytics_events
WHERE event_type IN ('PROFILING.RUN_CREATED', 'PROFILING.RUN_UPDATED');

CREATE TABLE IF NOT EXISTS profile_metric_history
(
  project_id UUID,
  event_id UUID,
  profile_run_id String,
  dataset_id String,
  dataset_version_id String,
  profile_column_id Nullable(String),
  metric_key LowCardinality(String),
  metric_json String,
  occurred_at DateTime64(3, 'UTC'),
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, metric_key, profile_run_id, profile_column_id, occurred_at, event_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_profile_metric_history
TO profile_metric_history
AS
SELECT
  project_id,
  event_id,
  aggregate_id AS profile_run_id,
  JSONExtractString(payload_json, 'datasetId') AS dataset_id,
  JSONExtractString(payload_json, 'datasetVersionId') AS dataset_version_id,
  nullIf(JSONExtractString(metric_json, 'profileColumnId'), '') AS profile_column_id,
  JSONExtractString(metric_json, 'metricKey') AS metric_key,
  metric_json,
  occurred_at,
  ingested_at
FROM
(
  SELECT
    project_id,
    event_id,
    aggregate_id,
    payload_json,
    occurred_at,
    ingested_at,
    arrayJoin(JSONExtractArrayRaw(payload_json, 'metrics')) AS metric_json
  FROM analytics_events
  WHERE event_type = 'PROFILING.METRIC_BATCH_CAPTURED'
);

CREATE TABLE IF NOT EXISTS profile_finding_history
(
  project_id UUID,
  event_id UUID,
  event_type LowCardinality(String),
  finding_id String,
  profile_run_id String,
  dataset_id String,
  dataset_version_id String,
  profile_column_id Nullable(String),
  finding_type LowCardinality(String),
  severity LowCardinality(String),
  occurred_at DateTime64(3, 'UTC'),
  payload_json String,
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, severity, finding_type, occurred_at, event_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_profile_finding_history
TO profile_finding_history
AS
SELECT
  project_id,
  event_id,
  event_type,
  aggregate_id AS finding_id,
  JSONExtractString(payload_json, 'profileRunId') AS profile_run_id,
  JSONExtractString(payload_json, 'datasetId') AS dataset_id,
  JSONExtractString(payload_json, 'datasetVersionId') AS dataset_version_id,
  nullIf(JSONExtractString(payload_json, 'profileColumnId'), '') AS profile_column_id,
  JSONExtractString(payload_json, 'findingType') AS finding_type,
  JSONExtractString(payload_json, 'severity') AS severity,
  occurred_at,
  payload_json,
  ingested_at
FROM analytics_events
WHERE event_type IN ('PROFILING.FINDING_CREATED', 'PROFILING.FINDING_UPDATED', 'PROFILING.FINDING_DELETED');

CREATE TABLE IF NOT EXISTS data_quality_score_history
(
  project_id UUID,
  event_id UUID,
  event_type LowCardinality(String),
  score_id String,
  profile_run_id String,
  dataset_id String,
  dataset_version_id String,
  completeness_score Nullable(Float64),
  uniqueness_score Nullable(Float64),
  validity_score Nullable(Float64),
  accuracy_score Nullable(Float64),
  overall_score Nullable(Float64),
  occurred_at DateTime64(3, 'UTC'),
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, dataset_id, occurred_at, event_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_data_quality_score_history
TO data_quality_score_history
AS
SELECT
  project_id,
  event_id,
  event_type,
  aggregate_id AS score_id,
  JSONExtractString(payload_json, 'profileRunId') AS profile_run_id,
  JSONExtractString(payload_json, 'datasetId') AS dataset_id,
  JSONExtractString(payload_json, 'datasetVersionId') AS dataset_version_id,
  if(JSONHas(payload_json, 'completenessScore'), toFloat64OrNull(JSONExtractRaw(payload_json, 'completenessScore')), NULL) AS completeness_score,
  if(JSONHas(payload_json, 'uniquenessScore'), toFloat64OrNull(JSONExtractRaw(payload_json, 'uniquenessScore')), NULL) AS uniqueness_score,
  if(JSONHas(payload_json, 'validityScore'), toFloat64OrNull(JSONExtractRaw(payload_json, 'validityScore')), NULL) AS validity_score,
  if(JSONHas(payload_json, 'accuracyScore'), toFloat64OrNull(JSONExtractRaw(payload_json, 'accuracyScore')), NULL) AS accuracy_score,
  if(JSONHas(payload_json, 'overallScore'), toFloat64OrNull(JSONExtractRaw(payload_json, 'overallScore')), NULL) AS overall_score,
  occurred_at,
  ingested_at
FROM analytics_events
WHERE event_type IN ('DQ.SCORE_CREATED', 'DQ.SCORE_UPDATED');
