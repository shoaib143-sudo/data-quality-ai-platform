-- ============================================================
-- Profiling Persistence Layer Enhancements
-- Purpose:
--   Extend existing profiling schema to support:
--   - profiling overview
--   - column statistics
--   - sensitivity classification
--   - candidate keys
--   - execution audit
--
-- Existing tables are preserved.
-- ============================================================


-- ============================================================
-- 1. Extend profile_runs
-- ============================================================

ALTER TABLE profiling.profile_runs

ADD COLUMN IF NOT EXISTS assumptions jsonb
NOT NULL
DEFAULT '{}'::jsonb;


ALTER TABLE profiling.profile_runs

ADD COLUMN IF NOT EXISTS summary jsonb
NOT NULL
DEFAULT '{}'::jsonb;



-- ============================================================
-- 2. Extend profile_columns
-- Supports:
--   - missingness
--   - distinct metrics
--   - sensitivity classification
-- ============================================================


ALTER TABLE profiling.profile_columns

ADD COLUMN IF NOT EXISTS total_count bigint;


ALTER TABLE profiling.profile_columns

ADD COLUMN IF NOT EXISTS non_null_count bigint;


ALTER TABLE profiling.profile_columns

ADD COLUMN IF NOT EXISTS null_count bigint;


ALTER TABLE profiling.profile_columns

ADD COLUMN IF NOT EXISTS blank_count bigint;


ALTER TABLE profiling.profile_columns

ADD COLUMN IF NOT EXISTS zero_count bigint;


ALTER TABLE profiling.profile_columns

ADD COLUMN IF NOT EXISTS distinct_count bigint;


ALTER TABLE profiling.profile_columns

ADD COLUMN IF NOT EXISTS distinct_percentage numeric;


ALTER TABLE profiling.profile_columns
ADD CONSTRAINT profile_columns_distinct_percentage_check
CHECK (
    distinct_percentage IS NULL
    OR (
        distinct_percentage >= 0
        AND distinct_percentage <= 100
    )
);


ALTER TABLE profiling.profile_columns
ADD COLUMN IF NOT EXISTS sensitivity_label text;


ALTER TABLE profiling.profile_columns

ADD COLUMN IF NOT EXISTS sensitivity_confidence numeric
CHECK (
    sensitivity_confidence IS NULL
    OR
    (
        sensitivity_confidence >= 0
        AND
        sensitivity_confidence <= 1
    )
);



-- ============================================================
-- 3. Extend profile_anomalies
-- Supports:
--   - deterministic explanation
--   - LLM interpretation context
-- ============================================================


ALTER TABLE profiling.profile_anomalies

ADD COLUMN IF NOT EXISTS detection_context jsonb
DEFAULT '{}'::jsonb;



-- ============================================================
-- 4. Candidate Keys
--
-- Supports:
--   - single-column keys
--   - composite keys
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.candidate_keys (

    id uuid NOT NULL
    DEFAULT gen_random_uuid(),


    profile_run_id uuid NOT NULL,


    columns jsonb NOT NULL,


    uniqueness_percentage numeric,


    null_percentage numeric,


    is_composite boolean
    NOT NULL
    DEFAULT false,


    confidence numeric
    CHECK (
        confidence IS NULL
        OR
        (
            confidence >= 0
            AND
            confidence <= 1
        )
    ),


    created_at timestamptz
    NOT NULL
    DEFAULT now(),



    CONSTRAINT candidate_keys_pkey
    PRIMARY KEY(id),
   
    CONSTRAINT candidate_keys_profile_run_fk

    FOREIGN KEY(profile_run_id)

    REFERENCES profiling.profile_runs(id)

    ON DELETE CASCADE

);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_keys_run_columns
    ON profiling.candidate_keys
    (
    profile_run_id,
    columns
    );

CREATE INDEX IF NOT EXISTS idx_candidate_keys_profile_run

ON profiling.candidate_keys(profile_run_id);



-- ============================================================
-- 5. Execution Logs
--
-- Captures:
--   - engine execution events
--   - sampling decisions
--   - warnings
--   - assumptions
-- ============================================================


CREATE TABLE IF NOT EXISTS profiling.execution_logs (

    id uuid NOT NULL
    DEFAULT gen_random_uuid(),


    profile_run_id uuid NOT NULL,


    event_type text NOT NULL,


    message text,


    metadata jsonb
    NOT NULL
    DEFAULT '{}'::jsonb,


    created_at timestamptz
    NOT NULL
    DEFAULT now(),



    CONSTRAINT execution_logs_pkey

    PRIMARY KEY(id),



    CONSTRAINT execution_logs_profile_run_fk

    FOREIGN KEY(profile_run_id)

    REFERENCES profiling.profile_runs(id)

    ON DELETE CASCADE

);



CREATE INDEX IF NOT EXISTS idx_execution_logs_profile_run

ON profiling.execution_logs(profile_run_id);





ALTER TABLE profiling.execution_logs
ADD COLUMN IF NOT EXISTS severity text DEFAULT 'INFO';


ALTER TABLE profiling.execution_logs
ADD CONSTRAINT execution_logs_severity_check
CHECK (
    severity IN
    (
        'INFO',
        'WARNING',
        'ERROR',
        'CRITICAL'
    )
);


-- ============================================================
-- 6. Validation indexes
-- ============================================================


CREATE INDEX IF NOT EXISTS idx_profile_columns_run

ON profiling.profile_columns(profile_run_id);



CREATE INDEX IF NOT EXISTS idx_profile_metrics_run

ON profiling.profile_metrics(profile_run_id);



CREATE INDEX IF NOT EXISTS idx_profile_findings_run

ON profiling.profile_findings(profile_run_id);



CREATE INDEX IF NOT EXISTS idx_profile_anomalies_run

ON profiling.profile_anomalies(profile_run_id);



COMMIT;