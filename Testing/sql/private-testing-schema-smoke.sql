-- DataNexus single-environment integration smoke.
-- Run with an authorized database administrator on the existing Supabase
-- project. Every fixture write is rolled back; nothing in an application or
-- governance schema is touched. Do not run with an end-user JWT.
BEGIN;

DO $private_testing_smoke$
DECLARE
  v_run_id uuid;
  v_mode text;
  v_rejected boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'testing')
     OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'testing' AND c.relname = 'fixture_runs' AND c.relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'testing' AND c.relname = 'fixture_assertions' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'TESTING_SCHEMA_MISSING_OR_RLS_DISABLED';
  END IF;

  IF has_schema_privilege('anon', 'testing', 'USAGE')
     OR has_schema_privilege('authenticated', 'testing', 'USAGE')
     OR has_table_privilege('anon', 'testing.fixture_runs', 'SELECT')
     OR has_table_privilege('authenticated', 'testing.fixture_assertions', 'INSERT') THEN
    RAISE EXCEPTION 'TESTING_SCHEMA_PUBLIC_ACCESS';
  END IF;
  IF NOT has_schema_privilege('service_role', 'testing', 'USAGE')
     OR NOT has_table_privilege('service_role', 'testing.fixture_runs', 'INSERT') THEN
    RAISE EXCEPTION 'TESTING_SCHEMA_BACKEND_ACCESS_MISSING';
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO testing.fixture_runs(suite_key, mode, scenario_key, synthetic)
    VALUES('rollback_smoke', 'INVALID_MODE', 'invalid_mode', true);
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'INVALID_MODE_ACCEPTED'; END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO testing.fixture_runs(suite_key, mode, scenario_key, synthetic)
    VALUES('rollback_smoke', 'GUIDED', 'non_synthetic', false);
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'NON_SYNTHETIC_FIXTURE_ACCEPTED'; END IF;

  FOREACH v_mode IN ARRAY ARRAY['OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS'] LOOP
    INSERT INTO testing.fixture_runs(
      suite_key, mode, scenario_key, status, synthetic, evidence, completed_at)
    VALUES(
      'rollback_smoke',v_mode,'isolated_schema_only','PASSED',true,
      jsonb_build_object('fixture_only',true,'not_e2e_certification',true),now())
    RETURNING id INTO v_run_id;
    INSERT INTO testing.fixture_assertions(fixture_run_id, assertion_key, result, details)
    VALUES(v_run_id,'private_schema','PASS',jsonb_build_object('synthetic',true));
  END LOOP;

  v_rejected := false;
  BEGIN
    INSERT INTO testing.fixture_assertions(fixture_run_id, assertion_key, result)
    VALUES(v_run_id,'private_schema','PASS');
  EXCEPTION WHEN unique_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'DUPLICATE_ASSERTION_ACCEPTED'; END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO testing.fixture_assertions(fixture_run_id, assertion_key, result)
    VALUES(v_run_id,'bad_result','INVALID');
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'INVALID_ASSERTION_RESULT_ACCEPTED'; END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO testing.fixture_assertions(fixture_run_id, assertion_key, result)
    VALUES(gen_random_uuid(),'orphan_assertion','PASS');
  EXCEPTION WHEN foreign_key_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'ORPHAN_ASSERTION_ACCEPTED'; END IF;
END
$private_testing_smoke$;

SELECT mode, count(*) AS fixture_runs, bool_and(synthetic) AS all_synthetic
FROM testing.fixture_runs
WHERE suite_key = 'rollback_smoke'
GROUP BY mode
ORDER BY mode;

-- Safety invariant: leave neither fixtures nor orphan test evidence in the
-- Dev/Test/Prod database.
ROLLBACK;
