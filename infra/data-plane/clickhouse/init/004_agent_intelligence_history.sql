CREATE TABLE IF NOT EXISTS agent_evaluation_history
(
  project_id UUID,
  event_id UUID,
  evaluation_id String,
  agent_run_id String,
  evaluator_type LowCardinality(String),
  evaluator_version LowCardinality(String),
  score Nullable(Float64),
  dimensions_json String,
  occurred_at DateTime64(3, 'UTC')
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, agent_run_id, evaluator_type, occurred_at, event_id)
TTL occurred_at + INTERVAL 730 DAY DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_agent_evaluation_history
TO agent_evaluation_history
AS
SELECT
  project_id,
  event_id,
  aggregate_id AS evaluation_id,
  JSONExtractString(payload_json, 'agentRunId') AS agent_run_id,
  JSONExtractString(payload_json, 'evaluatorType') AS evaluator_type,
  JSONExtractString(payload_json, 'evaluatorVersion') AS evaluator_version,
  nullIf(JSONExtractFloat(payload_json, 'score'), 0) AS score,
  JSONExtractRaw(payload_json, 'dimensions') AS dimensions_json,
  occurred_at
FROM analytics_events
WHERE event_type = 'AGENT.EVALUATION_CREATED';

CREATE TABLE IF NOT EXISTS agent_memory_history
(
  project_id UUID,
  event_id UUID,
  memory_id String,
  event_type LowCardinality(String),
  memory_type LowCardinality(String),
  memory_key String,
  status LowCardinality(String),
  confidence Nullable(Float64),
  expires_at Nullable(DateTime64(3, 'UTC')),
  occurred_at DateTime64(3, 'UTC')
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, memory_id, occurred_at, event_id)
TTL occurred_at + INTERVAL 730 DAY DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_agent_memory_history
TO agent_memory_history
AS
SELECT
  project_id,
  event_id,
  aggregate_id AS memory_id,
  event_type,
  JSONExtractString(payload_json, 'memoryType') AS memory_type,
  JSONExtractString(payload_json, 'memoryKey') AS memory_key,
  JSONExtractString(payload_json, 'status') AS status,
  nullIf(JSONExtractFloat(payload_json, 'confidence'), 0) AS confidence,
  parseDateTime64BestEffortOrNull(JSONExtractString(payload_json, 'expiresAt'), 3, 'UTC') AS expires_at,
  occurred_at
FROM analytics_events
WHERE event_type IN ('AGENT.MEMORY_CREATED','AGENT.MEMORY_UPDATED','AGENT.MEMORY_DELETED');
