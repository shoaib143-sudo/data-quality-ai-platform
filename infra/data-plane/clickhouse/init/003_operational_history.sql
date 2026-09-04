CREATE TABLE IF NOT EXISTS agent_run_history
(
  project_id UUID,
  event_id UUID,
  event_type LowCardinality(String),
  agent_run_id String,
  agent_definition_id String,
  dataset_id Nullable(String),
  dataset_version_id Nullable(String),
  parent_run_id Nullable(String),
  status LowCardinality(String),
  error_code Nullable(String),
  occurred_at DateTime64(3, 'UTC'),
  payload_json String,
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, agent_run_id, occurred_at, event_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_agent_run_history
TO agent_run_history
AS
SELECT
  project_id,
  event_id,
  event_type,
  aggregate_id AS agent_run_id,
  JSONExtractString(payload_json, 'agentDefinitionId') AS agent_definition_id,
  nullIf(JSONExtractString(payload_json, 'datasetId'), '') AS dataset_id,
  nullIf(JSONExtractString(payload_json, 'datasetVersionId'), '') AS dataset_version_id,
  nullIf(JSONExtractString(payload_json, 'parentRunId'), '') AS parent_run_id,
  JSONExtractString(payload_json, 'status') AS status,
  nullIf(JSONExtractString(payload_json, 'errorCode'), '') AS error_code,
  occurred_at,
  payload_json,
  ingested_at
FROM analytics_events
WHERE event_type IN ('AGENT.RUN_CREATED', 'AGENT.RUN_UPDATED');

CREATE TABLE IF NOT EXISTS observability_alert_history
(
  project_id UUID,
  event_id UUID,
  event_type LowCardinality(String),
  alert_id String,
  dataset_id String,
  dataset_version_id Nullable(String),
  profile_run_id Nullable(String),
  category LowCardinality(String),
  severity LowCardinality(String),
  status LowCardinality(String),
  fingerprint String,
  occurred_at DateTime64(3, 'UTC'),
  payload_json String,
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, dataset_id, severity, occurred_at, event_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_observability_alert_history
TO observability_alert_history
AS
SELECT
  project_id,
  event_id,
  event_type,
  aggregate_id AS alert_id,
  JSONExtractString(payload_json, 'datasetId') AS dataset_id,
  nullIf(JSONExtractString(payload_json, 'datasetVersionId'), '') AS dataset_version_id,
  nullIf(JSONExtractString(payload_json, 'profileRunId'), '') AS profile_run_id,
  JSONExtractString(payload_json, 'category') AS category,
  JSONExtractString(payload_json, 'severity') AS severity,
  JSONExtractString(payload_json, 'status') AS status,
  JSONExtractString(payload_json, 'fingerprint') AS fingerprint,
  occurred_at,
  payload_json,
  ingested_at
FROM analytics_events
WHERE event_type IN ('OBSERVABILITY.ALERT_CREATED', 'OBSERVABILITY.ALERT_UPDATED', 'OBSERVABILITY.ALERT_DELETED');

CREATE TABLE IF NOT EXISTS governance_issue_history
(
  project_id UUID,
  event_id UUID,
  event_type LowCardinality(String),
  issue_id String,
  dataset_id Nullable(String),
  dataset_version_id Nullable(String),
  profile_run_id Nullable(String),
  severity LowCardinality(String),
  status LowCardinality(String),
  occurred_at DateTime64(3, 'UTC'),
  payload_json String,
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, severity, status, occurred_at, event_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_governance_issue_history
TO governance_issue_history
AS
SELECT
  project_id,
  event_id,
  event_type,
  aggregate_id AS issue_id,
  nullIf(JSONExtractString(payload_json, 'datasetId'), '') AS dataset_id,
  nullIf(JSONExtractString(payload_json, 'datasetVersionId'), '') AS dataset_version_id,
  nullIf(JSONExtractString(payload_json, 'profileRunId'), '') AS profile_run_id,
  JSONExtractString(payload_json, 'severity') AS severity,
  JSONExtractString(payload_json, 'status') AS status,
  occurred_at,
  payload_json,
  ingested_at
FROM analytics_events
WHERE event_type IN ('GOVERNANCE.ISSUE_CREATED', 'GOVERNANCE.ISSUE_UPDATED', 'GOVERNANCE.ISSUE_DELETED');

CREATE TABLE IF NOT EXISTS observability_incident_history
(
  project_id UUID,
  event_id UUID,
  event_type LowCardinality(String),
  incident_id String,
  dataset_id String,
  severity LowCardinality(String),
  status LowCardinality(String),
  confidence Nullable(Float64),
  approval_required Nullable(Bool),
  escalation_level Nullable(Int32),
  occurred_at DateTime64(3, 'UTC'),
  payload_json String,
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (project_id, dataset_id, severity, occurred_at, event_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_observability_incident_history
TO observability_incident_history
AS
SELECT
  project_id,
  event_id,
  event_type,
  aggregate_id AS incident_id,
  JSONExtractString(payload_json, 'datasetId') AS dataset_id,
  JSONExtractString(payload_json, 'severity') AS severity,
  JSONExtractString(payload_json, 'status') AS status,
  if(JSONHas(payload_json, 'confidence'), toFloat64OrNull(JSONExtractRaw(payload_json, 'confidence')), NULL) AS confidence,
  if(JSONHas(payload_json, 'approvalRequired'), JSONExtractBool(payload_json, 'approvalRequired'), NULL) AS approval_required,
  if(JSONHas(payload_json, 'escalationLevel'), toInt32OrNull(JSONExtractRaw(payload_json, 'escalationLevel')), NULL) AS escalation_level,
  occurred_at,
  payload_json,
  ingested_at
FROM analytics_events
WHERE event_type IN ('OBSERVABILITY.INCIDENT_CREATED', 'OBSERVABILITY.INCIDENT_UPDATED', 'OBSERVABILITY.INCIDENT_DELETED');
