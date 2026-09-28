-- Terminal outcome coverage for prospective learning.
--
-- A terminal execution is not automatically a positive learning case. This
-- ledger makes every terminal run visible to denominator collection, including
-- failed, partial and cancelled runs, while leaving the verified outcome
-- authority in governance.governed_action_outcomes. The ledger is immutable
-- evidence and is populated by a database trigger so callers cannot omit
-- failed runs from prospective coverage.

create table if not exists agent.agent_run_outcome_coverage (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent.agent_runs(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  agent_definition_id uuid not null references agent.agent_definitions(id) on delete restrict,
  agent_key text not null check (length(btrim(agent_key)) > 0),
  agent_version text not null check (length(btrim(agent_version)) > 0),
  terminal_status text not null check (terminal_status in ('SUCCEEDED','COMPLETED','PARTIAL','FAILED','CANCELLED')),
  run_mode text not null check (run_mode in ('SUPERVISED','HANDSFREE','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS','OFF','UNCLASSIFIED')),
  mode_source text not null check (mode_source in ('LEARNING_RUN_MODE','RUN_MODE','UNCLASSIFIED')),
  provenance_status text not null check (provenance_status in ('PRODUCTION_ELIGIBLE','SYNTHETIC_OR_TEST','NOT_RECORDED')),
  production_eligible boolean not null default false,
  synthetic_or_test_detected boolean not null default false,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  observed_at timestamptz not null default now(),
  constraint agent_run_outcome_coverage_project_run_fk
    foreign key (agent_run_id, project_id)
    references agent.agent_runs(id, project_id)
    on delete cascade,
  constraint agent_run_outcome_coverage_provenance_ck check (
    (provenance_status = 'PRODUCTION_ELIGIBLE' and production_eligible = true and synthetic_or_test_detected = false)
    or (provenance_status = 'SYNTHETIC_OR_TEST' and production_eligible = false and synthetic_or_test_detected = true)
    or (provenance_status = 'NOT_RECORDED' and production_eligible = false)
  )
);

create index if not exists agent_run_outcome_coverage_project_agent_mode_idx
  on agent.agent_run_outcome_coverage(project_id, agent_key, run_mode, observed_at desc);
create index if not exists agent_run_outcome_coverage_terminal_idx
  on agent.agent_run_outcome_coverage(project_id, terminal_status, observed_at desc);

alter table agent.agent_run_outcome_coverage enable row level security;
revoke all on agent.agent_run_outcome_coverage from public, anon, authenticated, service_role;
grant select on agent.agent_run_outcome_coverage to authenticated, service_role;

drop policy if exists agent_run_outcome_coverage_project_read on agent.agent_run_outcome_coverage;
create policy agent_run_outcome_coverage_project_read
  on agent.agent_run_outcome_coverage
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

drop trigger if exists reject_agent_run_outcome_coverage_mutation
  on agent.agent_run_outcome_coverage;
create trigger reject_agent_run_outcome_coverage_mutation
before update or delete on agent.agent_run_outcome_coverage
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create or replace function agent.capture_terminal_agent_run_outcome_coverage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent, app, app_private
as $$
declare
  v_provenance jsonb := '{}'::jsonb;
  v_definition agent.agent_definitions%rowtype;
  v_run_mode text;
  v_mode_source text;
  v_provenance_status text := 'NOT_RECORDED';
  v_production_eligible boolean := false;
  v_synthetic boolean := false;
begin
  if tg_op <> 'UPDATE' or old.status::text = new.status::text then
    return new;
  end if;
  if new.status::text not in ('SUCCEEDED', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED') then
    return new;
  end if;

  select * into v_definition
  from agent.agent_definitions
  where id = new.agent_definition_id;
  if not found then
    return new;
  end if;

  if upper(coalesce(new.input->>'learningRunMode', '')) in ('SUPERVISED','HANDSFREE','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS','OFF')
    and upper(coalesce(new.input->>'run_mode', '')) in ('SUPERVISED','HANDSFREE','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS','OFF')
    and upper(new.input->>'learningRunMode') <> upper(new.input->>'run_mode') then
    v_run_mode := 'UNCLASSIFIED';
    v_mode_source := 'UNCLASSIFIED';
  elsif upper(coalesce(new.input->>'learningRunMode', '')) in ('SUPERVISED','HANDSFREE','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS','OFF') then
    v_run_mode := upper(new.input->>'learningRunMode');
    v_mode_source := 'LEARNING_RUN_MODE';
  elsif upper(coalesce(new.input->>'run_mode', '')) in ('SUPERVISED','HANDSFREE','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS','OFF') then
    v_run_mode := upper(new.input->>'run_mode');
    v_mode_source := 'RUN_MODE';
  else
    v_run_mode := 'UNCLASSIFIED';
    v_mode_source := 'UNCLASSIFIED';
  end if;

  begin
    v_provenance := agent.record_pgcl_run_learning_provenance(new.project_id, new.id);
    v_production_eligible := coalesce((v_provenance->>'productionEligible')::boolean, false);
    v_synthetic := coalesce((v_provenance->>'syntheticOrTestDetected')::boolean, false);
    v_provenance_status := case when v_synthetic then 'SYNTHETIC_OR_TEST' when v_production_eligible then 'PRODUCTION_ELIGIBLE' else 'NOT_RECORDED' end;
  exception when others then
    v_provenance := jsonb_build_object('status', 'NOT_RECORDED', 'reason', 'PROVENANCE_CAPTURE_FAILED');
  end;

  insert into agent.agent_run_outcome_coverage(
    agent_run_id, project_id, agent_definition_id, agent_key, agent_version,
    terminal_status, run_mode, mode_source, provenance_status,
    production_eligible, synthetic_or_test_detected, evidence
  ) values (
    new.id, new.project_id, new.agent_definition_id, v_definition.agent_key, v_definition.version,
    new.status::text, v_run_mode, v_mode_source, v_provenance_status,
    v_production_eligible, v_synthetic,
    jsonb_build_object(
      'source', 'agent.agent_runs',
      'agentRunId', new.id,
      'statusTransition', jsonb_build_object('from', old.status::text, 'to', new.status::text),
      'provenance', v_provenance,
      'verifiedOutcomeRequired', true
    )
  );

  return new;
end;
$$;

revoke all on function agent.capture_terminal_agent_run_outcome_coverage() from public, anon, authenticated, service_role;

drop trigger if exists capture_terminal_agent_run_outcome_coverage on agent.agent_runs;
create trigger capture_terminal_agent_run_outcome_coverage
after update of status on agent.agent_runs
for each row execute function agent.capture_terminal_agent_run_outcome_coverage();

create or replace view agent.agent_run_prospective_outcome_denominator
with (security_invoker = true)
as
select
  c.project_id,
  c.agent_key,
  c.agent_version,
  c.run_mode,
  c.mode_source,
  count(*)::integer as terminal_runs,
  count(*) filter (where c.production_eligible)::integer as production_eligible_runs,
  count(*) filter (where not c.production_eligible and c.provenance_status = 'NOT_RECORDED')::integer as pending_provenance_runs,
  count(*) filter (where c.provenance_status = 'SYNTHETIC_OR_TEST')::integer as excluded_synthetic_or_test_runs,
  count(*) filter (where not exists (
    select 1 from agent.learning_prospective_outcomes o
    where o.project_id = c.project_id and o.source_agent_run_id = c.agent_run_id
  ))::integer as awaiting_verified_outcome_runs,
  count(*) filter (where exists (
    select 1 from agent.learning_prospective_outcomes o
    where o.project_id = c.project_id and o.source_agent_run_id = c.agent_run_id
  ))::integer as verified_outcome_runs,
  count(*) filter (where c.terminal_status in ('FAILED','PARTIAL','CANCELLED'))::integer as non_success_terminal_runs,
  min(c.observed_at) as first_observed_at,
  max(c.observed_at) as last_observed_at
from agent.agent_run_outcome_coverage c
group by c.project_id, c.agent_key, c.agent_version, c.run_mode, c.mode_source;

comment on table agent.agent_run_outcome_coverage is
  'Immutable terminal run coverage. Every terminal status is counted as awaiting verified outcome until independent outcome evidence is recorded; execution success alone never implies effectiveness.';
comment on view agent.agent_run_prospective_outcome_denominator is
  'Explicit per-agent and per-run-mode prospective denominator. Verified outcome availability is derived from immutable prospective outcome evidence, so pending verification remains visible without mutating the terminal-run ledger.';
