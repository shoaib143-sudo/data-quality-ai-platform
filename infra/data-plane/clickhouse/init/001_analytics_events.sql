CREATE TABLE IF NOT EXISTS analytics_events
(
  schema_version UInt16,
  project_id UUID,
  event_id UUID,
  event_type LowCardinality(String),
  occurred_at DateTime64(3, 'UTC'),
  aggregate_type LowCardinality(String),
  aggregate_id String,
  aggregate_version Nullable(String),
  correlation_id Nullable(String),
  causation_id Nullable(String),
  actor_type Nullable(String),
  actor_id Nullable(String),
  payload_json String,
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, event_type, occurred_at, event_id);
