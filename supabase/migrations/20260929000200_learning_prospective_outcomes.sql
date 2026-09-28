-- Verified production outcomes are the prospective denominator, including failures.
-- Attribution is to the source run, never the verifier's run.
create table agent.learning_prospective_outcomes (
  outcome_id uuid primary key references governance.governed_action_outcomes(id) on delete restrict,
  project_id uuid not null references app.projects(id) on delete cascade,
  source_agent_run_id uuid not null references agent.agent_runs(id) on delete restrict,
  agent_key text not null,
  agent_version text not null,
  run_mode text not null,
  mode_source text not null,
  outcome_type text not null,
  effectiveness numeric check (effectiveness between 0 and 1),
  verified_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  check (run_mode <> 'UNCLASSIFIED' or mode_source = 'MISSING_OR_UNRECOGNIZED'),
  check (run_mode = 'UNCLASSIFIED' or mode_source in ('learningRunMode','run_mode'))
);
create index learning_prospective_outcomes_summary_idx
  on agent.learning_prospective_outcomes(project_id, agent_key, run_mode, verified_at desc);
alter table agent.learning_prospective_outcomes enable row level security;
create policy learning_prospective_outcomes_project_read
  on agent.learning_prospective_outcomes for select to authenticated
  using (app_private.is_project_member(project_id));
revoke all on agent.learning_prospective_outcomes from public, anon, authenticated, service_role;
grant select on agent.learning_prospective_outcomes to authenticated, service_role;
create trigger reject_learning_prospective_outcome_mutation
before update or delete on agent.learning_prospective_outcomes
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create function agent.collect_learning_prospective_outcome(p_outcome_id uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, agent, governance
as $$
declare
  v_outcome governance.governed_action_outcomes%rowtype;
  v_run agent.agent_runs%rowtype;
  v_definition agent.agent_definitions%rowtype;
  v_mode text;
  v_source text := 'MISSING_OR_UNRECOGNIZED';
begin
  select * into v_outcome from governance.governed_action_outcomes where id = p_outcome_id;
  if not found then raise exception 'governed outcome not found'; end if;
  if v_outcome.verification_state <> 'VERIFIED' or v_outcome.source_agent_run_id is null then return false; end if;
  select * into v_run from agent.agent_runs
  where id = v_outcome.source_agent_run_id and project_id = v_outcome.project_id;
  if not found then raise exception 'source run project mismatch'; end if;
  if not exists (
    select 1 from agent.agent_run_learning_provenance p
    where p.agent_run_id = v_run.id and p.project_id = v_outcome.project_id
      and p.production_eligible and p.classification = 'PRODUCTION_ELIGIBLE'
      and not p.synthetic_or_test_detected
  ) then return false; end if;
  select * into v_definition from agent.agent_definitions where id = v_run.agent_definition_id;
  if not found then raise exception 'source agent definition missing'; end if;
  if v_run.input->>'learningRunMode' in ('SUPERVISED','HANDSFREE','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS')
    and v_run.input->>'run_mode' in ('SUPERVISED','HANDSFREE','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS')
    and v_run.input->>'learningRunMode' <> v_run.input->>'run_mode' then
    v_mode := 'UNCLASSIFIED';
  elsif v_run.input->>'learningRunMode' in ('SUPERVISED','HANDSFREE','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS') then
    v_mode := v_run.input->>'learningRunMode'; v_source := 'learningRunMode';
  elsif v_run.input->>'run_mode' in ('SUPERVISED','HANDSFREE','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS') then
    v_mode := v_run.input->>'run_mode'; v_source := 'run_mode';
  else
    v_mode := 'UNCLASSIFIED';
  end if;
  insert into agent.learning_prospective_outcomes (
    outcome_id, project_id, source_agent_run_id, agent_key, agent_version,
    run_mode, mode_source, outcome_type, effectiveness, verified_at
  ) values (
    v_outcome.id, v_outcome.project_id, v_run.id, v_definition.agent_key, v_definition.version,
    v_mode, v_source, v_outcome.outcome_type, v_outcome.effectiveness, v_outcome.verified_at
  ) on conflict (outcome_id) do nothing;
  return true;
end;
$$;
revoke all on function agent.collect_learning_prospective_outcome(uuid) from public, anon, authenticated;
grant execute on function agent.collect_learning_prospective_outcome(uuid) to service_role;

create function agent.collect_learning_prospective_on_outcome_insert()
returns trigger language plpgsql security definer
set search_path = pg_catalog, agent
as $$
begin
  perform agent.collect_learning_prospective_outcome(new.id);
  return new;
end;
$$;
revoke all on function agent.collect_learning_prospective_on_outcome_insert() from public, anon, authenticated, service_role;
create trigger collect_learning_prospective_on_outcome_insert
after insert on governance.governed_action_outcomes
for each row execute function agent.collect_learning_prospective_on_outcome_insert();

create function agent.collect_learning_prospective_on_provenance_insert()
returns trigger language plpgsql security definer
set search_path = pg_catalog, agent, governance
as $$
declare v_outcome_id uuid;
begin
  if new.production_eligible and not new.synthetic_or_test_detected then
    for v_outcome_id in
      select id from governance.governed_action_outcomes
      where project_id = new.project_id and source_agent_run_id = new.agent_run_id
        and verification_state = 'VERIFIED'
    loop
      perform agent.collect_learning_prospective_outcome(v_outcome_id);
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function agent.collect_learning_prospective_on_provenance_insert() from public, anon, authenticated, service_role;
create trigger collect_learning_prospective_on_provenance_insert
after insert on agent.agent_run_learning_provenance
for each row execute function agent.collect_learning_prospective_on_provenance_insert();

comment on table agent.learning_prospective_outcomes is
  'Immutable verified production outcomes by source agent and explicit run mode. UNKNOWN and non-effective outcomes remain in the denominator.';

create function agent.summarize_learning_prospective_outcomes(p_project_id uuid)
returns table (
  agent_key text, agent_version text, run_mode text, sample_count bigint,
  effective_count bigint, ineffective_count bigint, partial_count bigint,
  other_count bigint, mean_effectiveness numeric,
  first_verified_at timestamptz, last_verified_at timestamptz
) language sql stable security definer
set search_path = pg_catalog, agent
as $$
  select o.agent_key, o.agent_version, o.run_mode, count(*),
    count(*) filter (where o.outcome_type = 'EFFECTIVE'),
    count(*) filter (where o.outcome_type = 'INEFFECTIVE'),
    count(*) filter (where o.outcome_type = 'PARTIAL'),
    count(*) filter (where o.outcome_type not in ('EFFECTIVE','INEFFECTIVE','PARTIAL')),
    avg(o.effectiveness), min(o.verified_at), max(o.verified_at)
  from agent.learning_prospective_outcomes o
  where o.project_id = p_project_id
  group by o.agent_key, o.agent_version, o.run_mode
  order by o.agent_key, o.agent_version, o.run_mode;
$$;
revoke all on function agent.summarize_learning_prospective_outcomes(uuid) from public, anon, authenticated;
grant execute on function agent.summarize_learning_prospective_outcomes(uuid) to service_role;
