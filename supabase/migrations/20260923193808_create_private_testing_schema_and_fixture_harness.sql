-- Already applied to the single shared DataNexus Supabase project as migration
-- 20260923193808. Track its exact DDL in GitHub without introducing a
-- second project, database branch, or production-test data copies.
CREATE SCHEMA IF NOT EXISTS testing;
COMMENT ON SCHEMA testing IS
  'Private DataNexus synthetic test fixtures and assertion evidence; never store production copies or credentials here.';
REVOKE ALL ON SCHEMA testing FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA testing TO service_role;

CREATE TABLE IF NOT EXISTS testing.fixture_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_key text NOT NULL CHECK (char_length(trim(suite_key)) BETWEEN 1 AND 160),
  mode text NOT NULL CHECK (mode IN ('OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS')),
  scenario_key text NOT NULL CHECK (char_length(trim(scenario_key)) BETWEEN 1 AND 160),
  synthetic boolean NOT NULL DEFAULT true CHECK (synthetic),
  status text NOT NULL DEFAULT 'CREATED'
    CHECK (status IN ('CREATED','RUNNING','PASSED','FAILED','BLOCKED')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
COMMENT ON TABLE testing.fixture_runs IS
  'Isolated synthetic test execution metadata. These are test-fixture results, not canonical governance orchestration or certification records.';

CREATE TABLE IF NOT EXISTS testing.fixture_assertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_run_id uuid NOT NULL REFERENCES testing.fixture_runs(id) ON DELETE CASCADE,
  assertion_key text NOT NULL CHECK (char_length(trim(assertion_key)) BETWEEN 1 AND 160),
  result text NOT NULL CHECK (result IN ('PASS','FAIL','BLOCKED','SKIPPED')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_run_id, assertion_key)
);
COMMENT ON TABLE testing.fixture_assertions IS
  'Synthetic and negative-case test assertions only; PASS here is never production certification.';

ALTER TABLE testing.fixture_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE testing.fixture_assertions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA testing FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  testing.fixture_runs, testing.fixture_assertions TO service_role;
