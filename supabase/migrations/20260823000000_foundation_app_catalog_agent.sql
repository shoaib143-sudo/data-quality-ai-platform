-- ============================================================
-- Foundation Layer
-- APP + CATALOG + AGENT
-- ============================================================

BEGIN;

-- ============================================================
-- Schemas
-- ============================================================

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS agent;
CREATE SCHEMA IF NOT EXISTS profiling;
CREATE SCHEMA IF NOT EXISTS governance;


-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$
BEGIN
    CREATE TYPE app.member_role AS ENUM
    (
        'OWNER',
        'ADMIN',
        'MEMBER',
        'VIEWER'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE catalog.dataset_status AS ENUM
    (
        'ACTIVE',
        'INACTIVE',
        'ARCHIVED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE catalog.dataset_version_status AS ENUM
    (
        'AVAILABLE',
        'PROCESSING',
        'FAILED',
        'ARCHIVED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE agent.run_status AS ENUM
    (
        'CREATED',
        'QUEUED',
        'RUNNING',
        'WAITING',
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
    CREATE TYPE agent.step_status AS ENUM
    (
        'PENDING',
        'RUNNING',
        'COMPLETED',
        'FAILED',
        'SKIPPED',
        'RETRYING'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE agent.message_status AS ENUM
    (
        'PENDING',
        'DELIVERED',
        'PROCESSED',
        'FAILED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


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
-- APP TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS app.organizations
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS app.organization_members
(
    organization_id uuid NOT NULL
        REFERENCES app.organizations(id)
        ON DELETE CASCADE,

    user_id uuid NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    role app.member_role NOT NULL DEFAULT 'MEMBER',

    created_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY
    (
        organization_id,
        user_id
    )
);


CREATE TABLE IF NOT EXISTS app.projects
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id uuid NOT NULL
        REFERENCES app.organizations(id)
        ON DELETE CASCADE,

    name text NOT NULL,

    slug text NOT NULL,

    description text,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE
    (
        organization_id,
        slug
    )
);


CREATE INDEX IF NOT EXISTS idx_org_members_user
ON app.organization_members(user_id);


CREATE INDEX IF NOT EXISTS idx_projects_org
ON app.projects(organization_id);










-- ============================================================
-- CATALOG TABLES
-- ============================================================


CREATE TABLE IF NOT EXISTS catalog.data_sources
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id uuid NOT NULL
        REFERENCES app.projects(id)
        ON DELETE CASCADE,

    name text NOT NULL,

    source_type text NOT NULL,

    connection_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    status text NOT NULL DEFAULT 'ACTIVE',

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE
    (
        project_id,
        name
    )
);



CREATE TABLE IF NOT EXISTS catalog.datasets
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id uuid NOT NULL
        REFERENCES app.projects(id)
        ON DELETE CASCADE,

    data_source_id uuid
        REFERENCES catalog.data_sources(id)
        ON DELETE SET NULL,

    name text NOT NULL,

    description text,

    source_identifier text,

    owner_user_id uuid
        REFERENCES auth.users(id)
        ON DELETE SET NULL,

    business_domain text,

    status catalog.dataset_status NOT NULL
        DEFAULT 'ACTIVE',

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE
    (
        project_id,
        name
    )
);



CREATE TABLE IF NOT EXISTS catalog.dataset_versions
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    dataset_id uuid NOT NULL
        REFERENCES catalog.datasets(id)
        ON DELETE CASCADE,

    version_number bigint NOT NULL,

    source_uri text,

    content_hash text,

    schema_hash text,

    row_count bigint,

    column_count integer,

    size_bytes bigint,

    observed_at timestamptz,

    status catalog.dataset_version_status NOT NULL
        DEFAULT 'PROCESSING',

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE
    (
        dataset_id,
        version_number
    ),

    CHECK
    (
        version_number > 0
    ),

    CHECK
    (
        row_count IS NULL
        OR row_count >= 0
    ),

    CHECK
    (
        column_count IS NULL
        OR column_count >= 0
    ),

    CHECK
    (
        size_bytes IS NULL
        OR size_bytes >= 0
    )
);



CREATE INDEX IF NOT EXISTS idx_data_sources_project
ON catalog.data_sources(project_id);


CREATE INDEX IF NOT EXISTS idx_datasets_project
ON catalog.datasets(project_id);


CREATE INDEX IF NOT EXISTS idx_dataset_versions_dataset
ON catalog.dataset_versions
(
    dataset_id,
    version_number DESC
);









-- ============================================================
-- AGENT TABLES
-- ============================================================


CREATE TABLE IF NOT EXISTS agent.agent_definitions
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_key text NOT NULL,

    name text NOT NULL,

    description text,

    version text NOT NULL,

    system_prompt text NOT NULL,

    configuration jsonb NOT NULL DEFAULT '{}'::jsonb,

    enabled boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),

    UNIQUE
    (
        agent_key,
        version
    )
);



CREATE TABLE IF NOT EXISTS agent.tool_definitions
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_definition_id uuid NOT NULL
        REFERENCES agent.agent_definitions(id)
        ON DELETE CASCADE,

    tool_key text NOT NULL,

    name text NOT NULL,

    description text NOT NULL,

    version text NOT NULL DEFAULT '1.0',

    input_schema jsonb NOT NULL,

    output_schema jsonb NOT NULL,

    execution_config jsonb NOT NULL DEFAULT '{}'::jsonb,

    enabled boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tool_definitions_agent_tool_version_key
        UNIQUE (agent_definition_id, tool_key, version)
);



CREATE TABLE IF NOT EXISTS agent.agent_runs
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_definition_id uuid NOT NULL
        REFERENCES agent.agent_definitions(id),

    project_id uuid NOT NULL
        REFERENCES app.projects(id),

    dataset_id uuid
        REFERENCES catalog.datasets(id),

    dataset_version_id uuid
        REFERENCES catalog.dataset_versions(id),

    parent_run_id uuid
        REFERENCES agent.agent_runs(id),

    correlation_id uuid NOT NULL
        DEFAULT gen_random_uuid(),

    status agent.run_status NOT NULL
        DEFAULT 'CREATED',

    input jsonb NOT NULL
        DEFAULT '{}'::jsonb,

    output jsonb,

    error_code text,

    error_message text,

    started_at timestamptz,

    completed_at timestamptz,

    created_at timestamptz NOT NULL
        DEFAULT now()
);



CREATE TABLE IF NOT EXISTS agent.agent_run_steps
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_run_id uuid NOT NULL
        REFERENCES agent.agent_runs(id)
        ON DELETE CASCADE,

    step_name text NOT NULL,

    step_order integer NOT NULL,

    status agent.step_status NOT NULL
        DEFAULT 'PENDING',

    attempt integer NOT NULL
        DEFAULT 1,

    input jsonb,

    output jsonb,

    started_at timestamptz,

    completed_at timestamptz,

    error_code text,

    error_message text,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    CHECK
    (
        attempt >= 1
    )
);



CREATE TABLE IF NOT EXISTS agent.agent_messages
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    source_agent_run_id uuid
        REFERENCES agent.agent_runs(id),

    target_agent_run_id uuid
        REFERENCES agent.agent_runs(id),

    message_type text NOT NULL,

    correlation_id uuid NOT NULL,

    payload jsonb NOT NULL,

    status agent.message_status NOT NULL
        DEFAULT 'PENDING',

    created_at timestamptz NOT NULL
        DEFAULT now(),

    delivered_at timestamptz,

    processed_at timestamptz
);



CREATE TABLE IF NOT EXISTS agent.agent_artifacts
(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_run_id uuid NOT NULL
        REFERENCES agent.agent_runs(id)
        ON DELETE CASCADE,

    artifact_type text NOT NULL,

    artifact_version text NOT NULL
        DEFAULT '1.0',

    name text,

    payload jsonb,

    storage_uri text,

    content_hash text,

    created_at timestamptz NOT NULL
        DEFAULT now()
);



-- ============================================================
-- AGENT INDEXES
-- ============================================================


CREATE INDEX IF NOT EXISTS idx_agent_runs_project
ON agent.agent_runs(project_id);


CREATE INDEX IF NOT EXISTS idx_agent_runs_dataset
ON agent.agent_runs(dataset_id);


CREATE INDEX IF NOT EXISTS idx_agent_runs_dataset_version
ON agent.agent_runs(dataset_version_id);


CREATE INDEX IF NOT EXISTS idx_agent_run_steps_run
ON agent.agent_run_steps(agent_run_id);


CREATE INDEX IF NOT EXISTS idx_agent_messages_source
ON agent.agent_messages(source_agent_run_id);


CREATE INDEX IF NOT EXISTS idx_agent_messages_target
ON agent.agent_messages(target_agent_run_id);


CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run
ON agent.agent_artifacts(agent_run_id);


-- ============================================================
-- PRIVATE FUNCTIONS
-- ============================================================


CREATE OR REPLACE FUNCTION app_private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;



CREATE OR REPLACE FUNCTION app_private.is_org_member(
    p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS
    (
        SELECT 1
        FROM app.organization_members m
        WHERE m.organization_id = p_org_id
        AND m.user_id = auth.uid()
    );
$$;



CREATE OR REPLACE FUNCTION app_private.is_org_admin(
    p_org_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS
    (
        SELECT 1
        FROM app.organization_members m
        WHERE m.organization_id = p_org_id
        AND m.user_id = auth.uid()
        AND m.role IN ('OWNER','ADMIN')
    );
$$;



CREATE OR REPLACE FUNCTION app_private.is_project_member(
    p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS
    (
        SELECT 1
        FROM app.projects p
        JOIN app.organization_members m
        ON m.organization_id = p.organization_id
        WHERE p.id = p_project_id
        AND m.user_id = auth.uid()
    );
$$;



CREATE OR REPLACE FUNCTION app_private.is_project_admin(
    p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS
    (
        SELECT 1
        FROM app.projects p
        JOIN app.organization_members m
        ON m.organization_id = p.organization_id
        WHERE p.id = p_project_id
        AND m.user_id = auth.uid()
        AND m.role IN ('OWNER','ADMIN')
    );
$$;


REVOKE ALL ON FUNCTION app_private.set_updated_at()
FROM public, anon, authenticated;


REVOKE ALL ON FUNCTION
app_private.is_org_member(uuid),
app_private.is_org_admin(uuid),
app_private.is_project_member(uuid),
app_private.is_project_admin(uuid)
FROM public, anon, authenticated;




CREATE TRIGGER trg_org_updated_at
BEFORE UPDATE
ON app.organizations
FOR EACH ROW
EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_project_updated_at
BEFORE UPDATE
ON app.projects
FOR EACH ROW
EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_source_updated_at
BEFORE UPDATE
ON catalog.data_sources
FOR EACH ROW
EXECUTE FUNCTION app_private.set_updated_at();

CREATE TRIGGER trg_dataset_updated_at
BEFORE UPDATE
ON catalog.datasets
FOR EACH ROW
EXECUTE FUNCTION app_private.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE app.organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.organization_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.projects ENABLE ROW LEVEL SECURITY;


ALTER TABLE catalog.data_sources ENABLE ROW LEVEL SECURITY;

ALTER TABLE catalog.datasets ENABLE ROW LEVEL SECURITY;

ALTER TABLE catalog.dataset_versions ENABLE ROW LEVEL SECURITY;


ALTER TABLE agent.agent_definitions ENABLE ROW LEVEL SECURITY;

ALTER TABLE agent.tool_definitions ENABLE ROW LEVEL SECURITY;

ALTER TABLE agent.agent_runs ENABLE ROW LEVEL SECURITY;

ALTER TABLE agent.agent_run_steps ENABLE ROW LEVEL SECURITY;

ALTER TABLE agent.agent_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE agent.agent_artifacts ENABLE ROW LEVEL SECURITY;



-- ============================================================
-- APP POLICIES
-- ============================================================


DROP POLICY IF EXISTS "organizations_select" ON "app"."organizations";

CREATE POLICY organizations_select
ON app.organizations
FOR SELECT
TO authenticated
USING
(
    app_private.is_org_member(id)
);



DROP POLICY IF EXISTS "organizations_update" ON "app"."organizations";

CREATE POLICY organizations_update
ON app.organizations
FOR UPDATE
TO authenticated
USING
(
    app_private.is_org_admin(id)
);



DROP POLICY IF EXISTS "organization_members_select" ON "app"."organization_members";

CREATE POLICY organization_members_select
ON app.organization_members
FOR SELECT
TO authenticated
USING
(
    app_private.is_org_member(organization_id)
);



DROP POLICY IF EXISTS "projects_select" ON "app"."projects";

CREATE POLICY projects_select
ON app.projects
FOR SELECT
TO authenticated
USING
(
    app_private.is_org_member(organization_id)
);



DROP POLICY IF EXISTS "projects_insert" ON "app"."projects";

CREATE POLICY projects_insert
ON app.projects
FOR INSERT
TO authenticated
WITH CHECK
(
    app_private.is_org_admin(organization_id)
);



DROP POLICY IF EXISTS "projects_update" ON "app"."projects";

CREATE POLICY projects_update
ON app.projects
FOR UPDATE
TO authenticated
USING
(
    app_private.is_org_admin(organization_id)
)
WITH CHECK
(
    app_private.is_org_admin(organization_id)
);



DROP POLICY IF EXISTS "projects_delete" ON "app"."projects";

CREATE POLICY projects_delete
ON app.projects
FOR DELETE
TO authenticated
USING
(
    app_private.is_org_admin(organization_id)
);



-- ============================================================
-- CATALOG POLICIES
-- ============================================================


DROP POLICY IF EXISTS "data_sources_select" ON "catalog"."data_sources";

CREATE POLICY data_sources_select
ON catalog.data_sources
FOR SELECT
TO authenticated
USING
(
    app_private.is_project_member(project_id)
);



DROP POLICY IF EXISTS "datasets_select" ON "catalog"."datasets";

CREATE POLICY datasets_select
ON catalog.datasets
FOR SELECT
TO authenticated
USING
(
    app_private.is_project_member(project_id)
);



DROP POLICY IF EXISTS "dataset_versions_select" ON "catalog"."dataset_versions";

CREATE POLICY dataset_versions_select
ON catalog.dataset_versions
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM catalog.datasets d
        WHERE d.id = dataset_versions.dataset_id
        AND app_private.is_project_member(d.project_id)
    )
);



-- ============================================================
-- AGENT POLICIES
-- ============================================================


DROP POLICY IF EXISTS "agent_definitions_select" ON "agent"."agent_definitions";

CREATE POLICY agent_definitions_select
ON agent.agent_definitions
FOR SELECT
TO authenticated
USING
(
    enabled = true
);



DROP POLICY IF EXISTS "tool_definitions_select" ON "agent"."tool_definitions";

CREATE POLICY tool_definitions_select
ON agent.tool_definitions
FOR SELECT
TO authenticated
USING
(
    enabled = true
);



DROP POLICY IF EXISTS "agent_runs_select" ON "agent"."agent_runs";

CREATE POLICY agent_runs_select
ON agent.agent_runs
FOR SELECT
TO authenticated
USING
(
    app_private.is_project_member(project_id)
);



DROP POLICY IF EXISTS "agent_steps_select" ON "agent"."agent_run_steps";

CREATE POLICY agent_steps_select
ON agent.agent_run_steps
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM agent.agent_runs r
        WHERE r.id = agent_run_steps.agent_run_id
        AND app_private.is_project_member(r.project_id)
    )
);



DROP POLICY IF EXISTS "agent_messages_select" ON "agent"."agent_messages";

CREATE POLICY agent_messages_select
ON agent.agent_messages
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM agent.agent_runs r
        WHERE r.id = agent_messages.target_agent_run_id
        AND app_private.is_project_member(r.project_id)
    )
);



DROP POLICY IF EXISTS "agent_artifacts_select" ON "agent"."agent_artifacts";

CREATE POLICY agent_artifacts_select
ON agent.agent_artifacts
FOR SELECT
TO authenticated
USING
(
    EXISTS
    (
        SELECT 1
        FROM agent.agent_runs r
        WHERE r.id = agent_artifacts.agent_run_id
        AND app_private.is_project_member(r.project_id)
    )
);



-- ============================================================
-- SERVICE ROLE ACCESS
-- ============================================================


GRANT ALL ON ALL TABLES IN SCHEMA app TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA catalog TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA agent TO service_role;



-- ============================================================
-- AUTHENTICATED READ ACCESS
-- ============================================================


GRANT SELECT
ON ALL TABLES IN SCHEMA app
TO authenticated;


GRANT SELECT
ON ALL TABLES IN SCHEMA catalog
TO authenticated;


GRANT SELECT
ON ALL TABLES IN SCHEMA agent
TO authenticated;



COMMIT;