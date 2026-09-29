-- Isolated PostgreSQL fixture for prospective learning evidence.
-- The disposable database simulates an unmarked production-eligible source
-- run to exercise the collector. These rows are rolled back and are not real
-- prospective production outcomes.
-- Run only against a disposable local Supabase database with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 \
--     -v fixture_guard=ISOLATED_PROSPECTIVE_OUTCOME_FIXTURE \
--     -f scripts/test-learning-prospective-outcome-fixture.sql

\set ON_ERROR_STOP on
\if :{?fixture_guard}
\else
  \echo 'fixture_guard is required'
  \quit 3
\endif

select set_config('app.fixture_guard', :'fixture_guard', false);
do $$
begin
  if current_setting('app.fixture_guard', true) <> 'ISOLATED_PROSPECTIVE_OUTCOME_FIXTURE' then
    raise exception 'refusing prospective-outcome fixture outside the isolated guard';
  end if;
end $$;

begin;

create temporary table learning_fixture_ids (
  project_id uuid not null,
  definition_id uuid not null,
  success_run_id uuid not null,
  partial_run_id uuid not null,
  failed_run_id uuid not null,
  cancelled_run_id uuid not null,
  action_id uuid not null,
  outcome_id uuid
) on commit drop;

with org_row as (
  insert into app.organizations(name, slug, metadata)
  values ('Prospective Outcome Fixture Organization', 'prospective-outcome-fixture-' || substr(gen_random_uuid()::text, 1, 8), '{}'::jsonb)
  returning id
), project_row as (
  insert into app.projects(organization_id, name, slug, metadata)
  select id, 'Prospective Outcome Fixture Project', 'prospective-outcome-fixture-' || substr(gen_random_uuid()::text, 1, 8), '{}'::jsonb
  from org_row
  returning id
), definition_row as (
  insert into agent.agent_definitions(agent_key, name, description, version, system_prompt, configuration)
  values ('support_agent', 'Prospective Outcome Fixture Agent', 'Disposable fixture agent', 'fixture-1.0', 'fixture', '{}'::jsonb)
  returning id
), runs as (
  insert into agent.agent_runs(agent_definition_id, project_id, status, input, output, started_at, completed_at)
  select d.id, p.id, r.status::agent.run_status, r.input, r.output, now() - interval '2 minutes', now()
  from project_row p cross join definition_row d
  cross join (values
    ('SUCCEEDED', '{"learningRunMode":"SUPERVISED"}'::jsonb, '{"result":"completed"}'::jsonb),
    ('PARTIAL', '{"run_mode":"HANDSFREE"}'::jsonb, '{"result":"partial"}'::jsonb),
    ('FAILED', '{"run_mode":"GUIDED"}'::jsonb, '{"error":"fixture failure"}'::jsonb),
    ('CANCELLED', '{"learningRunMode":"FULL_AUTONOMOUS","run_mode":"GUIDED"}'::jsonb, '{}'::jsonb)
  ) as r(status, input, output)
  returning id, project_id, status
)
insert into learning_fixture_ids(project_id, definition_id, success_run_id, partial_run_id, failed_run_id, cancelled_run_id, action_id)
select p.id, d.id,
  (select id from runs where status = 'SUCCEEDED'::agent.run_status),
  (select id from runs where status = 'PARTIAL'::agent.run_status),
  (select id from runs where status = 'FAILED'::agent.run_status),
  (select id from runs where status = 'CANCELLED'::agent.run_status),
  gen_random_uuid()
from project_row p cross join definition_row d;

-- A successful run is eligible for prospective collection only after an
-- independent governed outcome is recorded. Terminal coverage must exist first.
do $$
declare
  v_ids record;
  v_count integer;
begin
  select * into v_ids from learning_fixture_ids limit 1;
  select count(*) into v_count from agent.agent_run_outcome_coverage where project_id = v_ids.project_id;
  if v_count <> 4 then raise exception 'expected four terminal coverage rows, got %', v_count; end if;

  if not exists (
    select 1 from agent.agent_run_outcome_coverage
    where agent_run_id = v_ids.success_run_id and terminal_status = 'SUCCEEDED'
      and run_mode = 'SUPERVISED' and mode_source = 'LEARNING_RUN_MODE'
      and production_eligible and provenance_status = 'PRODUCTION_ELIGIBLE'
  ) then raise exception 'successful supervised run was not captured as production eligible'; end if;

  if not exists (
    select 1 from agent.agent_run_outcome_coverage
    where agent_run_id = v_ids.partial_run_id and terminal_status = 'PARTIAL'
      and run_mode = 'HANDSFREE' and mode_source = 'RUN_MODE'
      and production_eligible and provenance_status = 'PRODUCTION_ELIGIBLE'
  ) then raise exception 'partial handsfree run was not captured in denominator'; end if;

  if not exists (
    select 1 from agent.agent_run_outcome_coverage
    where agent_run_id = v_ids.failed_run_id and terminal_status = 'FAILED'
      and run_mode = 'GUIDED' and production_eligible
  ) then raise exception 'failed guided run was not captured in denominator'; end if;

  if not exists (
    select 1 from agent.agent_run_outcome_coverage
    where agent_run_id = v_ids.cancelled_run_id and terminal_status = 'CANCELLED'
      and run_mode = 'UNCLASSIFIED' and mode_source = 'UNCLASSIFIED'
      and production_eligible
  ) then raise exception 'conflicting mode was not classified safely'; end if;

  if exists (select 1 from agent.learning_prospective_outcomes where source_agent_run_id = v_ids.success_run_id) then
    raise exception 'prospective outcome appeared before delayed verification';
  end if;
end $$;

-- Build the minimum governed action authority required by the canonical outcome
-- table. This remains inside the disposable fixture transaction.
do $$
declare
  v_ids record;
  v_policy_id uuid;
  v_version_id uuid;
  v_action_id uuid;
begin
  select * into v_ids from learning_fixture_ids limit 1;
  insert into governance.autonomy_policies(
    project_id, action_key, enabled, execution_mode, min_confidence,
    max_auto_risk_level, reversible, allowed_target_types, metadata
  ) values (
    v_ids.project_id, 'CREATE_GOVERNANCE_ISSUE', true, 'AUTO', 0.8,
    'LOW', true, array['PROJECT'], '{}'::jsonb
  ) returning id into v_policy_id;
  select current_version_id into v_version_id from governance.autonomy_policies where id = v_policy_id;
  if v_version_id is null then raise exception 'fixture policy version was not captured'; end if;
  insert into governance.autonomy_actions(
    id, project_id, policy_id, policy_version_id, source_agent_run_id,
    action_key, target_type, risk_level, confidence, status, idempotency_key,
    input, before_state, result, executed_at
  ) values (
    (select action_id from learning_fixture_ids), v_ids.project_id, v_policy_id,
    v_version_id, v_ids.success_run_id, 'CREATE_GOVERNANCE_ISSUE', 'PROJECT',
    'LOW', 0.95, 'EXECUTED', 'prospective-outcome-fixture-action',
    '{}'::jsonb, '{}'::jsonb, '{"fixture":true}'::jsonb, now()
  ) returning id into v_action_id;
end $$;

-- Delayed verification: record the governed outcome after terminal coverage was
-- already captured. The outcome insert trigger must backfill prospective data.
do $$
declare
  v_ids record;
  v_policy_id uuid;
  v_version_id uuid;
  v_action_id uuid;
  v_outcome_id uuid;
begin
  select * into v_ids from learning_fixture_ids limit 1;
  select id, policy_id, policy_version_id into v_action_id, v_policy_id, v_version_id
  from governance.autonomy_actions where id = v_ids.action_id;
  insert into governance.governed_action_outcomes(
    project_id, autonomy_action_id, source_agent_run_id, policy_id, policy_version_id,
    verification_key, recommendation_type, recommendation_version, recommendation,
    decision_state, execution_state, executed_action, evidence_context,
    before_evidence, after_evidence, verification_state, outcome_type, effectiveness,
    runtime_evidence, verified_at
  ) values (
    v_ids.project_id, v_action_id, v_ids.success_run_id, v_policy_id, v_version_id,
    'prospective-outcome-fixture-verification', 'CREATE_GOVERNANCE_ISSUE', 'fixture-1.0',
    '{}'::jsonb, 'NOT_REQUIRED', 'EXECUTED', '{}'::jsonb, '{}'::jsonb,
    '{"before":true}'::jsonb, '{"after":true}'::jsonb, 'VERIFIED', 'EFFECTIVE', 1,
    '{"fixture":true}'::jsonb, now()
  ) returning id into v_outcome_id;
  update learning_fixture_ids set outcome_id = v_outcome_id;
end $$;

do $$
declare
  v_ids record;
  v_summary record;
begin
  select * into v_ids from learning_fixture_ids limit 1;
  if not exists (
    select 1 from agent.learning_prospective_outcomes
    where outcome_id = v_ids.outcome_id and source_agent_run_id = v_ids.success_run_id
      and run_mode = 'SUPERVISED' and outcome_type = 'EFFECTIVE'
  ) then raise exception 'delayed verified outcome was not collected'; end if;

  select * into v_summary
  from agent.agent_run_prospective_outcome_denominator
  where project_id = v_ids.project_id and agent_key = 'support_agent' and run_mode = 'SUPERVISED';
  if v_summary.terminal_runs <> 1 or v_summary.verified_outcome_runs <> 1
     or v_summary.awaiting_verified_outcome_runs <> 0 then
    raise exception 'supervised denominator is inconsistent: %', row_to_json(v_summary);
  end if;

  select * into v_summary
  from agent.agent_run_prospective_outcome_denominator
  where project_id = v_ids.project_id and agent_key = 'support_agent' and run_mode = 'HANDSFREE';
  if v_summary.non_success_terminal_runs <> 1 or v_summary.awaiting_verified_outcome_runs <> 1 then
    raise exception 'handsfree partial denominator is inconsistent: %', row_to_json(v_summary);
  end if;

  if (select count(*) from agent.agent_run_outcome_coverage where project_id = v_ids.project_id) <> 4 then
    raise exception 'terminal coverage row count changed unexpectedly';
  end if;
end $$;

rollback;

select 'isolated prospective outcome fixture passed' as result;
