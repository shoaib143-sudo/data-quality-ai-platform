-- ============================================================
-- Profiling Foundation Layer
-- Depends on:
--   app
--   catalog
--   agent
--
-- Created after foundation migration
-- ============================================================

BEGIN;


CREATE SCHEMA IF NOT EXISTS profiling;


-- ============================================================
-- ENUM TYPES
-- ============================================================


DO $$
BEGIN

CREATE TYPE profiling.run_status AS ENUM
(
    'RUNNING',
    'COMPLETED',
    'PARTIAL',
    'FAILED',
    'CANCELLED'
);

EXCEPTION
WHEN duplicate_object THEN NULL;

END $$;



DO $$
BEGIN

CREATE TYPE profiling.metric_scope AS ENUM
(
    'DATASET',
    'COLUMN',
    'DISTRIBUTION'
);

EXCEPTION
WHEN duplicate_object THEN NULL;

END $$;



DO $$
BEGIN

CREATE TYPE profiling.metric_value_type AS ENUM
(
    'NUMBER',
    'STRING',
    'BOOLEAN',
    'JSON'
);

EXCEPTION
WHEN duplicate_object THEN NULL;

END $$;



-- ============================================================
-- PROFILE DEFINITIONS
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.profile_definitions
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    name text NOT NULL,

    version text NOT NULL,

    definition jsonb NOT NULL,

    enabled boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now()
);



-- ============================================================
-- PROFILE RUNS
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.profile_runs
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    dataset_version_id uuid NOT NULL
        REFERENCES catalog.dataset_versions(id),

    agent_run_id uuid
        REFERENCES agent.agent_runs(id),

    profile_definition_id uuid
        REFERENCES profiling.profile_definitions(id),

    status profiling.run_status NOT NULL
        DEFAULT 'RUNNING',

    engine_name text NOT NULL,

    engine_version text NOT NULL,

    sampling_mode text,

    sampling_size bigint,

    sampling_rate numeric,

    sampling_seed bigint,

    row_count bigint,

    column_count integer,

    duplicate_row_count bigint,

    content_hash text,

    schema_hash text,

    configuration_hash text,

    profile_signature text,

    configuration jsonb NOT NULL DEFAULT '{}'::jsonb,

    started_at timestamptz NOT NULL DEFAULT now(),

    completed_at timestamptz
);



CREATE INDEX IF NOT EXISTS idx_profile_runs_dataset_version
ON profiling.profile_runs(dataset_version_id);



CREATE INDEX IF NOT EXISTS idx_profile_runs_agent
ON profiling.profile_runs(agent_run_id);



-- ============================================================
-- SCHEMA SNAPSHOTS
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.schema_snapshots
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_run_id uuid NOT NULL UNIQUE
        REFERENCES profiling.profile_runs(id),

    dataset_version_id uuid NOT NULL
        REFERENCES catalog.dataset_versions(id),

    schema_hash text NOT NULL,

    schema jsonb NOT NULL,

    created_at timestamptz NOT NULL DEFAULT now()
);



-- ============================================================
-- METRIC DEFINITIONS
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.metric_definitions
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    metric_key text UNIQUE NOT NULL,

    name text NOT NULL,

    scope profiling.metric_scope NOT NULL,

    value_type profiling.metric_value_type NOT NULL,

    description text,

    enabled boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now()
);



-- ============================================================
-- PROFILE COLUMNS
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.profile_columns
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_run_id uuid NOT NULL
        REFERENCES profiling.profile_runs(id),

    column_name text NOT NULL,

    ordinal_position integer,

    source_type text,

    inferred_type text,

    semantic_type text,

    nullable boolean,

    confidence numeric,

    is_candidate_key boolean NOT NULL DEFAULT false,

    key_confidence numeric,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now()
);



CREATE INDEX IF NOT EXISTS idx_profile_columns_run
ON profiling.profile_columns(profile_run_id);


-- ============================================================
-- PROFILE METRICS
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.profile_metrics
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_run_id uuid NOT NULL
        REFERENCES profiling.profile_runs(id),

    metric_definition_id uuid NOT NULL
        REFERENCES profiling.metric_definitions(id),

    profile_column_id uuid
        REFERENCES profiling.profile_columns(id),

    metric_key text NOT NULL,

    numeric_value numeric,

    text_value text,

    boolean_value boolean,

    json_value jsonb,

    created_at timestamptz NOT NULL DEFAULT now()
);



CREATE INDEX IF NOT EXISTS idx_profile_metrics_run
ON profiling.profile_metrics(profile_run_id);



CREATE INDEX IF NOT EXISTS idx_profile_metrics_column
ON profiling.profile_metrics(profile_column_id);



-- ============================================================
-- PROFILE DISTRIBUTIONS
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.profile_distributions
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_run_id uuid NOT NULL
        REFERENCES profiling.profile_runs(id),

    profile_column_id uuid NOT NULL
        REFERENCES profiling.profile_columns(id),

    distribution_type text NOT NULL,

    distribution jsonb NOT NULL,

    created_at timestamptz NOT NULL DEFAULT now()
);



CREATE INDEX IF NOT EXISTS idx_profile_distributions_run
ON profiling.profile_distributions(profile_run_id);



-- ============================================================
-- PROFILE FINDINGS
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.profile_findings
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_run_id uuid NOT NULL
        REFERENCES profiling.profile_runs(id),

    profile_column_id uuid
        REFERENCES profiling.profile_columns(id),

    finding_type text NOT NULL,

    severity text NOT NULL,

    title text NOT NULL,

    description text NOT NULL,

    confidence numeric,

    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

    recommendation jsonb,

    created_at timestamptz NOT NULL DEFAULT now()
);



CREATE INDEX IF NOT EXISTS idx_profile_findings_run
ON profiling.profile_findings(profile_run_id);



-- ============================================================
-- PROFILE COMPARISONS
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.profile_comparisons
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    current_profile_run_id uuid NOT NULL
        REFERENCES profiling.profile_runs(id),

    baseline_profile_run_id uuid NOT NULL
        REFERENCES profiling.profile_runs(id),

    comparison_type text NOT NULL
        DEFAULT 'BASELINE',

    status text NOT NULL
        DEFAULT 'COMPLETED',

    summary text,

    changes jsonb NOT NULL DEFAULT '{}'::jsonb,

    metrics_changed integer NOT NULL DEFAULT 0,

    anomalies_found integer NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT now()
);



CREATE INDEX IF NOT EXISTS idx_profile_comparisons_current
ON profiling.profile_comparisons(current_profile_run_id);



CREATE INDEX IF NOT EXISTS idx_profile_comparisons_baseline
ON profiling.profile_comparisons(baseline_profile_run_id);



-- ============================================================
-- PROFILE ANOMALIES
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.profile_anomalies
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_run_id uuid NOT NULL
        REFERENCES profiling.profile_runs(id),

    profile_column_id uuid
        REFERENCES profiling.profile_columns(id),

    metric_definition_id uuid
        REFERENCES profiling.metric_definitions(id),

    anomaly_type text NOT NULL,

    severity text NOT NULL DEFAULT 'MEDIUM',

    metric_key text,

    current_value numeric,

    baseline_value numeric,

    absolute_change numeric,

    relative_change numeric,

    direction text,

    title text NOT NULL,

    description text NOT NULL,

    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

    detected_by text NOT NULL DEFAULT 'profiling_engine',

    created_at timestamptz NOT NULL DEFAULT now()
);



CREATE INDEX IF NOT EXISTS idx_profile_anomalies_run
ON profiling.profile_anomalies(profile_run_id);


-- ============================================================
-- RLS ENABLEMENT
-- ============================================================


ALTER TABLE profiling.profile_definitions
ENABLE ROW LEVEL SECURITY;


ALTER TABLE profiling.profile_runs
ENABLE ROW LEVEL SECURITY;


ALTER TABLE profiling.schema_snapshots
ENABLE ROW LEVEL SECURITY;


ALTER TABLE profiling.metric_definitions
ENABLE ROW LEVEL SECURITY;


ALTER TABLE profiling.profile_columns
ENABLE ROW LEVEL SECURITY;


ALTER TABLE profiling.profile_metrics
ENABLE ROW LEVEL SECURITY;


ALTER TABLE profiling.profile_distributions
ENABLE ROW LEVEL SECURITY;


ALTER TABLE profiling.profile_findings
ENABLE ROW LEVEL SECURITY;


ALTER TABLE profiling.profile_comparisons
ENABLE ROW LEVEL SECURITY;


ALTER TABLE profiling.profile_anomalies
ENABLE ROW LEVEL SECURITY;



-- ============================================================
-- PROFILE RUN ACCESS
-- ============================================================


DROP POLICY IF EXISTS "profile_runs_select" ON "profiling"."profile_runs";

CREATE POLICY profile_runs_select
ON profiling.profile_runs
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM catalog.dataset_versions v
        JOIN catalog.datasets d
        ON d.id = v.dataset_id
        WHERE v.id = profile_runs.dataset_version_id
        AND app_private.is_project_member(d.project_id)
    )
);



DROP POLICY IF EXISTS "profile_columns_select" ON "profiling"."profile_columns";

CREATE POLICY profile_columns_select
ON profiling.profile_columns
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM profiling.profile_runs r
        JOIN catalog.dataset_versions v
        ON v.id = r.dataset_version_id
        JOIN catalog.datasets d
        ON d.id = v.dataset_id
        WHERE r.id = profile_columns.profile_run_id
        AND app_private.is_project_member(d.project_id)
    )
);



DROP POLICY IF EXISTS "profile_metrics_select" ON "profiling"."profile_metrics";

CREATE POLICY profile_metrics_select
ON profiling.profile_metrics
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM profiling.profile_runs r
        JOIN catalog.dataset_versions v
        ON v.id = r.dataset_version_id
        JOIN catalog.datasets d
        ON d.id = v.dataset_id
        WHERE r.id = profile_metrics.profile_run_id
        AND app_private.is_project_member(d.project_id)
    )
);



DROP POLICY IF EXISTS "profile_distributions_select" ON "profiling"."profile_distributions";

CREATE POLICY profile_distributions_select
ON profiling.profile_distributions
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM profiling.profile_runs r
        JOIN catalog.dataset_versions v
        ON v.id = r.dataset_version_id
        JOIN catalog.datasets d
        ON d.id = v.dataset_id
        WHERE r.id = profile_distributions.profile_run_id
        AND app_private.is_project_member(d.project_id)
    )
);



DROP POLICY IF EXISTS "profile_findings_select" ON "profiling"."profile_findings";

CREATE POLICY profile_findings_select
ON profiling.profile_findings
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM profiling.profile_runs r
        JOIN catalog.dataset_versions v
        ON v.id = r.dataset_version_id
        JOIN catalog.datasets d
        ON d.id = v.dataset_id
        WHERE r.id = profile_findings.profile_run_id
        AND app_private.is_project_member(d.project_id)
    )
);


-- ============================================================
-- REMAINING PROFILING POLICIES
-- ============================================================


DROP POLICY IF EXISTS "profile_schema_snapshots_select" ON "profiling"."schema_snapshots";

CREATE POLICY profile_schema_snapshots_select
ON profiling.schema_snapshots
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM profiling.profile_runs r
        JOIN catalog.dataset_versions v
        ON v.id = r.dataset_version_id
        JOIN catalog.datasets d
        ON d.id = v.dataset_id
        WHERE r.id = schema_snapshots.profile_run_id
        AND app_private.is_project_member(d.project_id)
    )
);



DROP POLICY IF EXISTS "profile_comparisons_select" ON "profiling"."profile_comparisons";

CREATE POLICY profile_comparisons_select
ON profiling.profile_comparisons
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM profiling.profile_runs r
        JOIN catalog.dataset_versions v
        ON v.id = r.dataset_version_id
        JOIN catalog.datasets d
        ON d.id = v.dataset_id
        WHERE r.id = profile_comparisons.current_profile_run_id
        AND app_private.is_project_member(d.project_id)
    )
);



DROP POLICY IF EXISTS "profile_anomalies_select" ON "profiling"."profile_anomalies";

CREATE POLICY profile_anomalies_select
ON profiling.profile_anomalies
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM profiling.profile_runs r
        JOIN catalog.dataset_versions v
        ON v.id = r.dataset_version_id
        JOIN catalog.datasets d
        ON d.id = v.dataset_id
        WHERE r.id = profile_anomalies.profile_run_id
        AND app_private.is_project_member(d.project_id)
    )
);



DROP POLICY IF EXISTS "metric_definitions_select" ON "profiling"."metric_definitions";

CREATE POLICY metric_definitions_select
ON profiling.metric_definitions
FOR SELECT
TO authenticated
USING
(
    enabled = true
);



DROP POLICY IF EXISTS "profile_definitions_select" ON "profiling"."profile_definitions";

CREATE POLICY profile_definitions_select
ON profiling.profile_definitions
FOR SELECT
TO authenticated
USING
(
    enabled = true
);



-- ============================================================
-- SERVICE ROLE ACCESS
-- ============================================================


GRANT ALL
ON ALL TABLES IN SCHEMA profiling
TO service_role;



-- ============================================================
-- AUTHENTICATED ACCESS
-- ============================================================


GRANT SELECT
ON ALL TABLES IN SCHEMA profiling
TO authenticated;



-- ============================================================
-- COMPLETE
-- ============================================================


COMMIT;