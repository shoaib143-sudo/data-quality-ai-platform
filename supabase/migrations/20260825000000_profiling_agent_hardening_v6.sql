/*
  ============================================================================
  Profiling Agent Hardening / Observability Extension v6
  ============================================================================
  Target:
    Existing Supabase project:
      tvjnavjxuehpesxcfvrx

  IMPORTANT:
    This migration intentionally BUILDS ON the existing foundation.

    Existing schemas already present:
      app
      catalog
      profiling
      agent
      governance
      app_private

    Existing foundation tables already present:
      app.organizations
      app.organization_members
      app.projects

      catalog.data_sources
      catalog.datasets
      catalog.dataset_versions

      profiling.metric_definitions
      profiling.profile_definitions
      profiling.profile_runs
      profiling.profile_columns
      profiling.profile_metrics
      profiling.profile_distributions
      profiling.profile_findings
      profiling.schema_snapshots

      agent.agent_definitions
      agent.agent_runs
      agent.agent_run_steps
      agent.agent_messages
      agent.agent_artifacts
      agent.tool_definitions

  This migration adds:
    - profile comparisons
    - explicit profiling anomaly records
    - observability indexes
    - stronger execution invariants
    - additional Profiling Agent tools
    - production tool schemas
    - production agent configuration
    - least-privilege API grants
    - RLS for newly-created tables
    - executor/service-role access
    - idempotent seed/upsert behavior

  It does NOT:
    - drop existing objects
    - recreate existing enums
    - recreate existing foundation tables
    - expose service credentials
    - grant anonymous access
    - add public write access
  ============================================================================
*/

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================================
-- 0. REQUIRED FOUNDATION CHECKS
-- ============================================================================

do $$
begin
  if to_regclass('app.organizations') is null then
    raise exception
      'Required foundation table app.organizations is missing';
  end if;

  if to_regclass('app.projects') is null then
    raise exception
      'Required foundation table app.projects is missing';
  end if;

  if to_regclass('catalog.datasets') is null then
    raise exception
      'Required foundation table catalog.datasets is missing';
  end if;

  if to_regclass('catalog.dataset_versions') is null then
    raise exception
      'Required foundation table catalog.dataset_versions is missing';
  end if;

  if to_regclass('profiling.profile_runs') is null then
    raise exception
      'Required foundation table profiling.profile_runs is missing';
  end if;

  if to_regclass('profiling.profile_columns') is null then
    raise exception
      'Required foundation table profiling.profile_columns is missing';
  end if;

  if to_regclass('profiling.profile_metrics') is null then
    raise exception
      'Required foundation table profiling.profile_metrics is missing';
  end if;

  if to_regclass('profiling.metric_definitions') is null then
    raise exception
      'Required foundation table profiling.metric_definitions is missing';
  end if;

  if to_regclass('agent.agent_definitions') is null then
    raise exception
      'Required foundation table agent.agent_definitions is missing';
  end if;

  if to_regclass('agent.tool_definitions') is null then
    raise exception
      'Required foundation table agent.tool_definitions is missing';
  end if;

  if to_regprocedure('app_private.is_project_member(uuid)') is null then
    raise exception
      'Required RLS helper app_private.is_project_member(uuid) is missing';
  end if;
end
$$;


-- ============================================================================
-- 1. PROFILE COMPARISONS
-- ============================================================================

create table if not exists profiling.profile_comparisons (
  id uuid primary key default gen_random_uuid(),

  current_profile_run_id uuid not null,
  baseline_profile_run_id uuid not null,

  comparison_type text not null default 'BASELINE',

  status text not null default 'COMPLETED',

  summary text,

  changes jsonb not null default '{}'::jsonb,

  metrics_changed integer not null default 0,
  anomalies_found integer not null default 0,

  created_at timestamptz not null default now(),

  constraint profile_comparisons_current_fk
    foreign key (current_profile_run_id)
    references profiling.profile_runs(id)
    on delete cascade,

  constraint profile_comparisons_baseline_fk
    foreign key (baseline_profile_run_id)
    references profiling.profile_runs(id)
    on delete cascade,

  constraint profile_comparisons_different_runs_check
    check (current_profile_run_id <> baseline_profile_run_id),

  constraint profile_comparisons_type_check
    check (
      comparison_type in (
        'BASELINE',
        'PREVIOUS_RUN',
        'VERSION',
        'MANUAL'
      )
    ),

  constraint profile_comparisons_status_check
    check (
      status in (
        'PENDING',
        'RUNNING',
        'COMPLETED',
        'PARTIAL',
        'FAILED'
      )
    ),

  constraint profile_comparisons_metrics_changed_check
    check (metrics_changed >= 0),

  constraint profile_comparisons_anomalies_found_check
    check (anomalies_found >= 0)
);

create unique index if not exists
  profile_comparisons_current_baseline_uq
on profiling.profile_comparisons (
  current_profile_run_id,
  baseline_profile_run_id,
  comparison_type
);

create index if not exists
  profile_comparisons_current_idx
on profiling.profile_comparisons (
  current_profile_run_id,
  created_at desc
);

create index if not exists
  profile_comparisons_baseline_idx
on profiling.profile_comparisons (
  baseline_profile_run_id,
  created_at desc
);


-- ============================================================================
-- 2. EXPLICIT PROFILING ANOMALIES
-- ============================================================================
--
-- Existing profile_findings remains the richer user-facing finding layer.
-- profile_anomalies is intentionally narrower:
--     metric + baseline + observed change
--
-- This separation allows Observability to query anomalies efficiently without
-- interpreting every profiling finding as an anomaly.
-- ============================================================================

create table if not exists profiling.profile_anomalies (
  id uuid primary key default gen_random_uuid(),

  profile_run_id uuid not null,
  profile_column_id uuid,

  metric_definition_id uuid,

  anomaly_type text not null,
  severity text not null default 'MEDIUM',

  metric_key text,

  current_value numeric,
  baseline_value numeric,

  absolute_change numeric,
  relative_change numeric,

  direction text,

  title text not null,
  description text not null,

  evidence jsonb not null default '{}'::jsonb,

  detected_by text not null default 'profiling_engine',

  created_at timestamptz not null default now(),

  constraint profile_anomalies_run_fk
    foreign key (profile_run_id)
    references profiling.profile_runs(id)
    on delete cascade,

  constraint profile_anomalies_column_fk
    foreign key (profile_column_id)
    references profiling.profile_columns(id)
    on delete cascade,

  constraint profile_anomalies_metric_fk
    foreign key (metric_definition_id)
    references profiling.metric_definitions(id)
    on delete set null,

  constraint profile_anomalies_severity_check
    check (
      severity in (
        'INFO',
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL'
      )
    ),

  constraint profile_anomalies_direction_check
    check (
      direction is null
      or direction in (
        'INCREASE',
        'DECREASE',
        'NEW',
        'REMOVED',
        'CHANGED'
      )
    ),

  constraint profile_anomalies_relative_change_check
    check (
      relative_change is null
      or relative_change >= -1
    )
);

create index if not exists
  profile_anomalies_run_idx
on profiling.profile_anomalies (
  profile_run_id,
  created_at desc
);

create index if not exists
  profile_anomalies_column_idx
on profiling.profile_anomalies (
  profile_column_id,
  created_at desc
);

create index if not exists
  profile_anomalies_metric_idx
on profiling.profile_anomalies (
  metric_key,
  created_at desc
);

create index if not exists
  profile_anomalies_severity_idx
on profiling.profile_anomalies (
  severity,
  created_at desc
);


-- ============================================================================
-- 3. OBSERVABILITY / PROFILING INDEXES
-- ============================================================================

create index if not exists
  profile_runs_dataset_started_idx
on profiling.profile_runs (
  dataset_version_id,
  started_at desc
);

create index if not exists
  profile_runs_status_started_idx
on profiling.profile_runs (
  status,
  started_at desc
);

create index if not exists
  profile_metrics_run_key_idx
on profiling.profile_metrics (
  profile_run_id,
  metric_key
);

create index if not exists
  profile_metrics_column_key_idx
on profiling.profile_metrics (
  profile_column_id,
  metric_key
);

create index if not exists
  profile_columns_run_ordinal_idx
on profiling.profile_columns (
  profile_run_id,
  ordinal_position
);

create index if not exists
  profile_findings_run_severity_idx
on profiling.profile_findings (
  profile_run_id,
  severity,
  created_at desc
);

create index if not exists
  schema_snapshots_dataset_created_idx
on profiling.schema_snapshots (
  dataset_version_id,
  created_at desc
);


-- ============================================================================
-- 4. AGENT EXECUTION INDEXES
-- ============================================================================

create index if not exists
  agent_runs_project_created_idx
on agent.agent_runs (
  project_id,
  created_at desc
);

create index if not exists
  agent_runs_project_status_idx
on agent.agent_runs (
  project_id,
  status,
  created_at desc
);

create index if not exists
  agent_runs_dataset_idx
on agent.agent_runs (
  dataset_id,
  created_at desc
);

create index if not exists
  agent_runs_dataset_version_idx
on agent.agent_runs (
  dataset_version_id,
  created_at desc
);

create index if not exists
  agent_run_steps_run_order_idx
on agent.agent_run_steps (
  agent_run_id,
  step_order
);

create index if not exists
  agent_messages_correlation_idx
on agent.agent_messages (
  correlation_id,
  created_at desc
);

create index if not exists
  tool_definitions_agent_enabled_idx
on agent.tool_definitions (
  agent_definition_id,
  enabled,
  tool_key
);


-- ============================================================================
-- 5. RLS — NEW TABLES
-- ============================================================================

alter table profiling.profile_comparisons
  enable row level security;

alter table profiling.profile_anomalies
  enable row level security;


-- ============================================================================
-- 6. RLS — PROFILE COMPARISONS
-- ============================================================================

drop policy if exists profile_comparison_select
on profiling.profile_comparisons;

create policy profile_comparison_select
on profiling.profile_comparisons
for select
to authenticated
using (
  exists (
    select 1
    from profiling.profile_runs current_run
    join catalog.dataset_versions current_version
      on current_version.id = current_run.dataset_version_id
    join catalog.datasets current_dataset
      on current_dataset.id = current_version.dataset_id
    where current_run.id = profile_comparisons.current_profile_run_id
      and (
        select app_private.is_project_member(
          current_dataset.project_id
        )
      )
  )
);


-- ============================================================================
-- 7. RLS — PROFILE ANOMALIES
-- ============================================================================

drop policy if exists profile_anomaly_select
on profiling.profile_anomalies;

create policy profile_anomaly_select
on profiling.profile_anomalies
for select
to authenticated
using (
  exists (
    select 1
    from profiling.profile_runs r
    join catalog.dataset_versions v
      on v.id = r.dataset_version_id
    join catalog.datasets d
      on d.id = v.dataset_id
    where r.id = profile_anomalies.profile_run_id
      and (
        select app_private.is_project_member(
          d.project_id
        )
      )
  )
);


-- ============================================================================
-- 8. LEAST-PRIVILEGE API GRANTS
-- ============================================================================
--
-- The browser uses the publishable key and authenticated JWT.
--
-- No anonymous access is granted.
--
-- service_role is intentionally used only by trusted server-side execution.
-- Supabase service_role/secret access bypasses RLS by design, so it must never
-- be exposed to the browser.
-- ============================================================================

revoke all on table profiling.profile_comparisons
from anon;

revoke all on table profiling.profile_anomalies
from anon;

revoke all on table profiling.profile_comparisons
from authenticated;

revoke all on table profiling.profile_anomalies
from authenticated;

grant select on table profiling.profile_comparisons
to authenticated;

grant select on table profiling.profile_anomalies
to authenticated;

grant all on table profiling.profile_comparisons
to service_role;

grant all on table profiling.profile_anomalies
to service_role;


-- ============================================================================
-- 9. LOCK DOWN EXISTING PROFILING TABLE GRANTS
-- ============================================================================
--
-- These tables are read-only from the browser.
--
-- Profiling execution writes through trusted server-side execution.
-- ============================================================================

revoke all on table profiling.profile_runs
from anon;

revoke all on table profiling.profile_columns
from anon;

revoke all on table profiling.profile_metrics
from anon;

revoke all on table profiling.profile_distributions
from anon;

revoke all on table profiling.profile_findings
from anon;

revoke all on table profiling.schema_snapshots
from anon;

revoke all on table profiling.metric_definitions
from anon;

revoke all on table profiling.profile_definitions
from anon;


grant select on table profiling.profile_runs
to authenticated;

grant select on table profiling.profile_columns
to authenticated;

grant select on table profiling.profile_metrics
to authenticated;

grant select on table profiling.profile_distributions
to authenticated;

grant select on table profiling.profile_findings
to authenticated;

grant select on table profiling.schema_snapshots
to authenticated;

grant select on table profiling.metric_definitions
to authenticated;

grant select on table profiling.profile_definitions
to authenticated;

grant all on table profiling.profile_runs
to service_role;

grant all on table profiling.profile_columns
to service_role;

grant all on table profiling.profile_metrics
to service_role;

grant all on table profiling.profile_distributions
to service_role;

grant all on table profiling.profile_findings
to service_role;

grant all on table profiling.schema_snapshots
to service_role;

grant all on table profiling.metric_definitions
to service_role;

grant all on table profiling.profile_definitions
to service_role;


-- ============================================================================
-- 10. METRIC DEFINITIONS
-- ============================================================================
--
-- Existing definitions are preserved.
-- New definitions are inserted only when missing.
-- ============================================================================

insert into profiling.metric_definitions (
  metric_key,
  name,
  scope,
  value_type,
  description,
  enabled
)
values

(
  'outlier_count',
  'Outlier Count',
  'COLUMN'::profiling.metric_scope,
  'NUMBER'::profiling.metric_value_type,
  'Number of observations classified as statistical outliers.',
  true
),

(
  'outlier_rate',
  'Outlier Rate',
  'COLUMN'::profiling.metric_scope,
  'NUMBER'::profiling.metric_value_type,
  'Fraction of non-null observations classified as statistical outliers.',
  true
),

(
  'candidate_key_confidence',
  'Candidate Key Confidence',
  'COLUMN'::profiling.metric_scope,
  'NUMBER'::profiling.metric_value_type,
  'Confidence that a column uniquely identifies rows.',
  true
),

(
  'pattern_count',
  'Pattern Count',
  'COLUMN'::profiling.metric_scope,
  'NUMBER'::profiling.metric_value_type,
  'Number of distinct structural patterns detected.',
  true
),

(
  'sensitive_match_rate',
  'Sensitive Match Rate',
  'COLUMN'::profiling.metric_scope,
  'NUMBER'::profiling.metric_value_type,
  'Fraction of sampled values matching a sensitive-data detector.',
  true
),

(
  'schema_hash',
  'Schema Hash',
  'DATASET'::profiling.metric_scope,
  'STRING'::profiling.metric_value_type,
  'Stable hash representing the normalized dataset schema.',
  true
)

on conflict (metric_key)
do update set
  name = excluded.name,
  scope = excluded.scope,
  value_type = excluded.value_type,
  description = excluded.description,
  enabled = excluded.enabled;


-- ============================================================================
-- 11. PROFILING AGENT DEFINITION
-- ============================================================================

insert into agent.agent_definitions (
  agent_key,
  name,
  description,
  version,
  system_prompt,
  configuration,
  enabled
)
values (
  'profiling_agent',
  'Profiling Agent',
  'Deterministic data profiling orchestration agent responsible for dataset inspection, schema inference, statistical profiling, anomaly detection and profile comparison.',
  '2.0',

  $prompt$
You are the Profiling Agent.

Your responsibility is to inspect datasets, infer structural and semantic
characteristics, execute deterministic profiling tools, identify statistically
meaningful observations, compare profile runs when a baseline exists, and
produce structured profiling results for downstream Data Quality and Data
Observability agents.

CORE RULES

1. Never invent, estimate, or hallucinate data statistics.
2. Never calculate production statistics from intuition or language-model
   reasoning.
3. Use the approved profiling tools for all dataset-derived values.
4. Never modify the source dataset.
5. Treat dataset_version_id and profiling_run_id as immutable execution
   identifiers.
6. Prefer deterministic execution over probabilistic interpretation.
7. Preserve evidence for material findings.
8. Never expose raw sensitive values when aggregate evidence is sufficient.
9. Candidate PII/sensitive detection is a classification signal, not proof of
   legal or regulatory classification.
10. When a baseline exists, compare current metrics against the baseline.
11. If a tool fails, record the failure and do not fabricate a replacement
    result.
12. Return structured JSON-compatible results.

EXECUTION ORDER

For a normal profiling request:

1. inspect_dataset
2. infer_column_types
3. profile_dataset
4. detect_patterns
5. infer_candidate_keys
6. compare_profiles when a valid baseline exists
7. persist_profile_snapshot
8. complete_profile_run

SPECIALIZED TOOLS

Use specialized tools when requested or when the profiling configuration
requires them.

SECURITY

The agent may only operate on datasets explicitly supplied by the execution
context.

The agent must not access another organization or project.

The agent must not request service credentials.

The agent must not execute arbitrary SQL.

The agent must not directly modify source files.

OUTPUT

Return:

- profiling_run_id
- dataset_version_id
- status
- row_count when known
- column_count when known
- profile summary
- metric summary
- findings
- anomalies
- comparison summary when available
- execution warnings
- tool failures when applicable
$prompt$,

  jsonb_build_object(
    'execution_mode', 'deterministic_tools',
    'default_engine', 'profiling-executor',
    'max_tool_calls', 32,
    'max_retries_per_tool', 2,
    'require_baseline_when_available', true,
    'sensitive_value_logging', false,
    'source_mutation_allowed', false
  ),

  true
)

on conflict (agent_key, version)
do update set
  name = excluded.name,
  description = excluded.description,
  system_prompt = excluded.system_prompt,
  configuration = excluded.configuration,
  enabled = excluded.enabled;


-- ============================================================================
-- 12. TOOL REGISTRY
-- ============================================================================
--
-- Tool schemas follow JSON Schema conventions.
-- Execution configuration is metadata only; the actual executor validates
-- and authorizes every call independently.
-- ============================================================================

do $$
declare
  v_agent_id uuid;
begin

  select id
  into v_agent_id
  from agent.agent_definitions
  where agent_key = 'profiling_agent'
    and version = '2.0';

  if v_agent_id is null then
    raise exception 'Profiling Agent v2.0 was not created';
  end if;


  -- --------------------------------------------------------------------------
  -- inspect_dataset
  -- --------------------------------------------------------------------------

  insert into agent.tool_definitions (
    agent_definition_id,
    tool_key,
    name,
    description,
    version,
    input_schema,
    output_schema,
    execution_config,
    enabled
  )
  values (
    v_agent_id,
    'inspect_dataset',
    'Inspect Dataset',
    'Inspect dataset metadata, dimensions and source characteristics without modifying the source.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["dataset_version_id"],
      "properties": {
        "dataset_version_id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["dataset_version_id", "row_count", "column_count", "columns"],
      "properties": {
        "dataset_version_id": {
          "type": "string",
          "format": "uuid"
        },
        "row_count": {
          "type": ["integer", "null"],
          "minimum": 0
        },
        "column_count": {
          "type": ["integer", "null"],
          "minimum": 0
        },
        "columns": {
          "type": "array"
        },
        "format": {
          "type": ["string", "null"]
        },
        "encoding": {
          "type": ["string", "null"]
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "inspect_dataset",
      "timeout_ms": 30000,
      "max_retries": 2,
      "idempotent": true,
      "requires_source_access": true
    }'::jsonb,

    true
  )

  on conflict (
    agent_definition_id,
    tool_key,
    version
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    execution_config = excluded.execution_config,
    enabled = excluded.enabled;


  -- --------------------------------------------------------------------------
  -- infer_column_types
  -- --------------------------------------------------------------------------

  insert into agent.tool_definitions (
    agent_definition_id,
    tool_key,
    name,
    description,
    version,
    input_schema,
    output_schema,
    execution_config,
    enabled
  )
  values (
    v_agent_id,
    'infer_column_types',
    'Infer Column Types',
    'Infer physical, logical and semantic column types from deterministic sample analysis.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["dataset_version_id"],
      "properties": {
        "dataset_version_id": {
          "type": "string",
          "format": "uuid"
        },
        "max_rows": {
          "type": "integer",
          "minimum": 1,
          "maximum": 1000000
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["dataset_version_id", "columns"],
      "properties": {
        "dataset_version_id": {
          "type": "string",
          "format": "uuid"
        },
        "columns": {
          "type": "array"
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "infer_column_types",
      "timeout_ms": 120000,
      "max_retries": 2,
      "idempotent": true,
      "requires_source_access": true
    }'::jsonb,

    true
  )

  on conflict (
    agent_definition_id,
    tool_key,
    version
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    execution_config = excluded.execution_config,
    enabled = excluded.enabled;


  -- --------------------------------------------------------------------------
  -- profile_dataset
  -- --------------------------------------------------------------------------

  insert into agent.tool_definitions (
    agent_definition_id,
    tool_key,
    name,
    description,
    version,
    input_schema,
    output_schema,
    execution_config,
    enabled
  )
  values (
    v_agent_id,
    'profile_dataset',
    'Profile Dataset',
    'Execute the deterministic profiling engine and persist structured profile metrics.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["dataset_version_id", "profiling_run_id"],
      "properties": {
        "dataset_version_id": {
          "type": "string",
          "format": "uuid"
        },
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "options": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "include_distributions": {
              "type": "boolean",
              "default": true
            },
            "include_outliers": {
              "type": "boolean",
              "default": true
            },
            "include_patterns": {
              "type": "boolean",
              "default": true
            },
            "include_candidate_keys": {
              "type": "boolean",
              "default": true
            },
            "include_sensitive_detection": {
              "type": "boolean",
              "default": true
            }
          }
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": [
        "profiling_run_id",
        "dataset_version_id",
        "status"
      ],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "dataset_version_id": {
          "type": "string",
          "format": "uuid"
        },
        "status": {
          "type": "string",
          "enum": [
            "COMPLETED",
            "PARTIAL",
            "FAILED"
          ]
        },
        "row_count": {
          "type": ["integer", "null"],
          "minimum": 0
        },
        "column_count": {
          "type": ["integer", "null"],
          "minimum": 0
        },
        "anomalies_found": {
          "type": "integer",
          "minimum": 0
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "profile_dataset",
      "timeout_ms": 600000,
      "max_retries": 2,
      "idempotent": true,
      "requires_source_access": true,
      "writes_profile_results": true
    }'::jsonb,

    true
  )

  on conflict (
    agent_definition_id,
    tool_key,
    version
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    execution_config = excluded.execution_config,
    enabled = excluded.enabled;


  -- --------------------------------------------------------------------------
  -- detect_patterns
  -- --------------------------------------------------------------------------

  insert into agent.tool_definitions (
    agent_definition_id,
    tool_key,
    name,
    description,
    version,
    input_schema,
    output_schema,
    execution_config,
    enabled
  )
  values (
    v_agent_id,
    'detect_patterns',
    'Detect Patterns',
    'Detect structural patterns in string and categorical columns without exposing raw values.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id", "columns"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "columns": {
          "type": "array"
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "detect_patterns",
      "timeout_ms": 180000,
      "max_retries": 2,
      "idempotent": true,
      "sensitive_value_logging": false
    }'::jsonb,

    true
  )

  on conflict (
    agent_definition_id,
    tool_key,
    version
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    execution_config = excluded.execution_config,
    enabled = excluded.enabled;


  -- --------------------------------------------------------------------------
  -- infer_candidate_keys
  -- --------------------------------------------------------------------------

  insert into agent.tool_definitions (
    agent_definition_id,
    tool_key,
    name,
    description,
    version,
    input_schema,
    output_schema,
    execution_config,
    enabled
  )
  values (
    v_agent_id,
    'infer_candidate_keys',
    'Infer Candidate Keys',
    'Identify candidate single-column keys using deterministic uniqueness and nullability evidence.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id", "candidates"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "candidates": {
          "type": "array"
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "infer_candidate_keys",
      "timeout_ms": 120000,
      "max_retries": 2,
      "idempotent": true
    }'::jsonb,

    true
  )

  on conflict (
    agent_definition_id,
    tool_key,
    version
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    execution_config = excluded.execution_config,
    enabled = excluded.enabled;


  -- --------------------------------------------------------------------------
  -- compare_profiles
  -- --------------------------------------------------------------------------

  insert into agent.tool_definitions (
    agent_definition_id,
    tool_key,
    name,
    description,
    version,
    input_schema,
    output_schema,
    execution_config,
    enabled
  )
  values (
    v_agent_id,
    'compare_profiles',
    'Compare Profiles',
    'Compare the current profile against a baseline profile and persist metric changes.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": [
        "current_profile_run_id",
        "baseline_profile_run_id"
      ],
      "properties": {
        "current_profile_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "baseline_profile_run_id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": [
        "comparison_id",
        "status",
        "metrics_changed",
        "anomalies_found"
      ],
      "properties": {
        "comparison_id": {
          "type": "string",
          "format": "uuid"
        },
        "status": {
          "type": "string",
          "enum": [
            "COMPLETED",
            "PARTIAL",
            "FAILED"
          ]
        },
        "metrics_changed": {
          "type": "integer",
          "minimum": 0
        },
        "anomalies_found": {
          "type": "integer",
          "minimum": 0
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "compare_profiles",
      "timeout_ms": 180000,
      "max_retries": 2,
      "idempotent": true,
      "writes_comparison": true,
      "writes_anomalies": true
    }'::jsonb,

    true
  )

  on conflict (
    agent_definition_id,
    tool_key,
    version
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    execution_config = excluded.execution_config,
    enabled = excluded.enabled;


  -- --------------------------------------------------------------------------
  -- persist_profile_snapshot
  -- --------------------------------------------------------------------------

  insert into agent.tool_definitions (
    agent_definition_id,
    tool_key,
    name,
    description,
    version,
    input_schema,
    output_schema,
    execution_config,
    enabled
  )
  values (
    v_agent_id,
    'persist_profile_snapshot',
    'Persist Profile Snapshot',
    'Persist the final normalized profile snapshot and schema signature.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id", "snapshot_id"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "snapshot_id": {
          "type": "string",
          "format": "uuid"
        },
        "schema_hash": {
          "type": ["string", "null"]
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "persist_profile_snapshot",
      "timeout_ms": 120000,
      "max_retries": 2,
      "idempotent": true,
      "writes_profile_results": true
    }'::jsonb,

    true
  )

  on conflict (
    agent_definition_id,
    tool_key,
    version
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    execution_config = excluded.execution_config,
    enabled = excluded.enabled;


  -- --------------------------------------------------------------------------
  -- complete_profile_run
  -- --------------------------------------------------------------------------

  insert into agent.tool_definitions (
    agent_definition_id,
    tool_key,
    name,
    description,
    version,
    input_schema,
    output_schema,
    execution_config,
    enabled
  )
  values (
    v_agent_id,
    'complete_profile_run',
    'Complete Profile Run',
    'Finalize profiling execution state after deterministic profiling and persistence have completed.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": [
        "profiling_run_id",
        "status"
      ],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "status": {
          "type": "string",
          "enum": [
            "COMPLETED",
            "PARTIAL",
            "FAILED",
            "CANCELLED"
          ]
        },
        "error_code": {
          "type": ["string", "null"]
        },
        "error_message": {
          "type": ["string", "null"]
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": [
        "profiling_run_id",
        "status"
      ],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "status": {
          "type": "string",
          "enum": [
            "COMPLETED",
            "PARTIAL",
            "FAILED",
            "CANCELLED"
          ]
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "complete_profile_run",
      "timeout_ms": 30000,
      "max_retries": 1,
      "idempotent": true,
      "writes_profile_results": true
    }'::jsonb,

    true
  )

  on conflict (
    agent_definition_id,
    tool_key,
    version
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    execution_config = excluded.execution_config,
    enabled = excluded.enabled;


  -- --------------------------------------------------------------------------
  -- Additional deterministic profiling tools
  -- --------------------------------------------------------------------------

  insert into agent.tool_definitions (
    agent_definition_id,
    tool_key,
    name,
    description,
    version,
    input_schema,
    output_schema,
    execution_config,
    enabled
  )
  values
  (
    v_agent_id,
    'detect_outliers',
    'Detect Outliers',
    'Detect statistical outliers using deterministic configured methods.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "method": {
          "type": "string",
          "enum": ["IQR", "Z_SCORE", "ROBUST_Z_SCORE"],
          "default": "IQR"
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id", "columns"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "columns": {
          "type": "array"
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "detect_outliers",
      "timeout_ms": 180000,
      "max_retries": 2,
      "idempotent": true
    }'::jsonb,

    true
  ),

  (
    v_agent_id,
    'detect_sensitive_columns',
    'Detect Sensitive Columns',
    'Detect potential sensitive-data patterns using aggregate, privacy-preserving evidence.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id", "columns"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "columns": {
          "type": "array"
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "detect_sensitive_columns",
      "timeout_ms": 180000,
      "max_retries": 2,
      "idempotent": true,
      "sensitive_value_logging": false
    }'::jsonb,

    true
  ),

  (
    v_agent_id,
    'get_profile_run',
    'Get Profile Run',
    'Retrieve the structured state and results of a profiling run.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id", "status"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "status": {
          "type": "string"
        },
        "summary": {
          "type": ["object", "null"]
        },
        "metrics": {
          "type": "array"
        },
        "findings": {
          "type": "array"
        },
        "anomalies": {
          "type": "array"
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "get_profile_run",
      "timeout_ms": 30000,
      "max_retries": 2,
      "idempotent": true,
      "read_only": true
    }'::jsonb,

    true
  ),

  (
    v_agent_id,
    'detect_duplicates',
    'Detect Duplicates',
    'Detect duplicate rows and duplicate candidate-key values without modifying the source.',
    '2.0',

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        }
      }
    }'::jsonb,

    '{
      "type": "object",
      "additionalProperties": false,
      "required": ["profiling_run_id", "duplicate_row_count"],
      "properties": {
        "profiling_run_id": {
          "type": "string",
          "format": "uuid"
        },
        "duplicate_row_count": {
          "type": "integer",
          "minimum": 0
        },
        "duplicate_rate": {
          "type": ["number", "null"],
          "minimum": 0
        }
      }
    }'::jsonb,

    '{
      "executor": "profiling-executor",
      "operation": "detect_duplicates",
      "timeout_ms": 180000,
      "max_retries": 2,
      "idempotent": true
    }'::jsonb,

    true
  )

  on conflict (
    agent_definition_id,
    tool_key,
    version
  )
  do update set
    name = excluded.name,
    description = excluded.description,
    input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    execution_config = excluded.execution_config,
    enabled = excluded.enabled;

end
$$;


-- ============================================================================
-- 13. FINAL TOOL/AGENT READ ACCESS
-- ============================================================================

revoke all on table agent.agent_definitions
from anon;

revoke all on table agent.tool_definitions
from anon;

grant select on table agent.agent_definitions
to authenticated;

grant select on table agent.tool_definitions
to authenticated;

grant all on table agent.agent_definitions
to service_role;

grant all on table agent.tool_definitions
to service_role;


-- ============================================================================
-- 14. FINAL SECURITY ASSERTIONS
-- ============================================================================

do $$
declare
  r record;
begin

  -- Newly-created tables must have RLS enabled.
  for r in
    select *
    from (
      values
        ('profiling', 'profile_comparisons'),
        ('profiling', 'profile_anomalies')
    ) as required(schema_name, table_name)
  loop

    if not exists (
      select 1
      from pg_class c
      join pg_namespace n
        on n.oid = c.relnamespace
      where n.nspname = r.schema_name
        and c.relname = r.table_name
        and c.relrowsecurity = true
    ) then
      raise exception
        'RLS is not enabled on %.%',
        r.schema_name,
        r.table_name;
    end if;

  end loop;


  -- Anonymous access must not exist on new observability tables.
  if has_table_privilege(
       'anon',
       'profiling.profile_comparisons',
       'SELECT'
     )
  then
    raise exception
      'anon still has SELECT privilege on profiling.profile_comparisons';
  end if;

  if has_table_privilege(
       'anon',
       'profiling.profile_anomalies',
       'SELECT'
     )
  then
    raise exception
      'anon still has SELECT privilege on profiling.profile_anomalies';
  end if;


  -- Agent v2 must exist.
  if not exists (
    select 1
    from agent.agent_definitions
    where agent_key = 'profiling_agent'
      and version = '2.0'
      and enabled = true
  ) then
    raise exception
      'Profiling Agent v2.0 is missing or disabled';
  end if;


  -- Required tool set.
  if (
    select count(*)
    from agent.tool_definitions t
    join agent.agent_definitions a
      on a.id = t.agent_definition_id
    where a.agent_key = 'profiling_agent'
      and a.version = '2.0'
      and t.enabled = true
      and t.tool_key in (
        'inspect_dataset',
        'infer_column_types',
        'profile_dataset',
        'detect_patterns',
        'infer_candidate_keys',
        'compare_profiles',
        'persist_profile_snapshot',
        'complete_profile_run',
        'detect_outliers',
        'detect_sensitive_columns',
        'get_profile_run',
        'detect_duplicates'
      )
  ) <> 12 then
    raise exception
      'Profiling Agent required tool registry is incomplete';
  end if;

end
$$;


commit;