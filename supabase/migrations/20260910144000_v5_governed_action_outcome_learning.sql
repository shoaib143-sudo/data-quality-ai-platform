-- V5: Governed Action, Outcome Learning and Continuous Evaluation
-- Creates an immutable, service-only outcome authority between governed action
-- execution and reusable learning. Memory never grants action authority.

create table if not exists governance.governed_action_outcomes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  autonomy_action_id uuid not null references governance.autonomy_actions(id) on delete restrict,
  verification_key text not null,
  source_agent_run_id uuid references agent.agent_runs(id) on delete restrict,
  verification_agent_run_id uuid references agent.agent_runs(id) on delete restrict,
  policy_id uuid not null references governance.autonomy_policies(id) on delete restrict,
  policy_version_id uuid not null references governance.autonomy_policy_versions(id) on delete restrict,
  approval_workflow_instance_id uuid references governance.workflow_instances(id) on delete restrict,
  recommendation_type text not null,
  recommendation_version text not null,
  recommendation jsonb not null default '{}'::jsonb,
  decision_state text not null,
  decision_reason text,
  execution_state text not null,
  executed_action jsonb not null default '{}'::jsonb,
  evidence_context jsonb not null default '{}'::jsonb,
  before_evidence jsonb not null default '{}'::jsonb,
  after_evidence jsonb not null default '{}'::jsonb,
  verification_state text not null,
  outcome_type text not null,
  effectiveness numeric,
  runtime_evidence jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete restrict,
  verified_at timestamptz,
  recorded_at timestamptz not null default now(),
  constraint governed_action_outcomes_verification_key_ck check (length(trim(verification_key)) > 0),
  constraint governed_action_outcomes_recommendation_type_ck check (length(trim(recommendation_type)) > 0),
  constraint governed_action_outcomes_recommendation_version_ck check (length(trim(recommendation_version)) > 0),
  constraint governed_action_outcomes_decision_ck check (decision_state in ('APPROVED','REJECTED','POLICY_DENIED','NOT_REQUIRED')),
  constraint governed_action_outcomes_execution_ck check (execution_state in ('EXECUTED','ROLLED_BACK','FAILED','NOT_EXECUTED')),
  constraint governed_action_outcomes_verification_ck check (verification_state in ('VERIFIED','FAILED','INCONCLUSIVE')),
  constraint governed_action_outcomes_type_ck check (outcome_type in ('EFFECTIVE','INEFFECTIVE','PARTIAL','ROLLED_BACK','REJECTED','POLICY_BLOCKED','FAILED','UNKNOWN')),
  constraint governed_action_outcomes_effectiveness_ck check (effectiveness is null or (effectiveness >= 0 and effectiveness <= 1)),
  constraint governed_action_outcomes_verified_ck check ((verification_state = 'VERIFIED' and verified_at is not null) or (verification_state <> 'VERIFIED' and verified_at is null)),
  constraint governed_action_outcomes_project_action_verification_uq unique (project_id, autonomy_action_id, verification_key)
);

create index if not exists governed_action_outcomes_project_verified_idx
  on governance.governed_action_outcomes(project_id, verified_at desc)
  where verification_state = 'VERIFIED';
create index if not exists governed_action_outcomes_action_idx
  on governance.governed_action_outcomes(autonomy_action_id);
create index if not exists governed_action_outcomes_source_agent_idx
  on governance.governed_action_outcomes(source_agent_run_id)
  where source_agent_run_id is not null;
create index if not exists governed_action_outcomes_verification_agent_idx
  on governance.governed_action_outcomes(verification_agent_run_id)
  where verification_agent_run_id is not null;
create index if not exists governed_action_outcomes_policy_idx
  on governance.governed_action_outcomes(policy_id);
create index if not exists governed_action_outcomes_policy_version_idx
  on governance.governed_action_outcomes(policy_version_id);
create index if not exists governed_action_outcomes_workflow_idx
  on governance.governed_action_outcomes(approval_workflow_instance_id)
  where approval_workflow_instance_id is not null;
create index if not exists governed_action_outcomes_actor_idx
  on governance.governed_action_outcomes(actor_user_id)
  where actor_user_id is not null;

alter table governance.governed_action_outcomes enable row level security;
revoke all on governance.governed_action_outcomes from public, anon, authenticated;
grant select on governance.governed_action_outcomes to service_role;

create or replace function governance.reject_governed_action_outcome_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, governance
as $$
begin
  raise exception 'Governed action outcomes are immutable evidence';
end;
$$;

revoke all on function governance.reject_governed_action_outcome_mutation() from public, anon, authenticated;

drop trigger if exists reject_governed_action_outcome_mutation on governance.governed_action_outcomes;
create trigger reject_governed_action_outcome_mutation
before update or delete on governance.governed_action_outcomes
for each row execute function governance.reject_governed_action_outcome_mutation();

create or replace function governance.record_governed_action_outcome(
  p_project_id uuid,
  p_autonomy_action_id uuid,
  p_verification_key text,
  p_recommendation_type text,
  p_recommendation_version text,
  p_recommendation jsonb default '{}'::jsonb,
  p_evidence_context jsonb default '{}'::jsonb,
  p_before_evidence jsonb default '{}'::jsonb,
  p_after_evidence jsonb default '{}'::jsonb,
  p_verification_state text default 'INCONCLUSIVE',
  p_outcome_type text default 'UNKNOWN',
  p_effectiveness numeric default null,
  p_verification_agent_run_id uuid default null,
  p_actor_user_id uuid default null,
  p_decision_reason text default null,
  p_runtime_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, governance, agent, app
as $$
declare
  v_action governance.autonomy_actions%rowtype;
  v_workflow_status text;
  v_decision_state text;
  v_execution_state text;
  v_verification_state text := upper(trim(coalesce(p_verification_state, '')));
  v_outcome_type text := upper(trim(coalesce(p_outcome_type, '')));
  v_existing governance.governed_action_outcomes%rowtype;
  v_id uuid;
begin
  if p_project_id is null or p_autonomy_action_id is null then
    raise exception 'project and autonomy action are required';
  end if;
  if length(trim(coalesce(p_verification_key,''))) = 0 then raise exception 'verification key is required'; end if;
  if length(trim(coalesce(p_recommendation_type,''))) = 0 then raise exception 'recommendation type is required'; end if;
  if length(trim(coalesce(p_recommendation_version,''))) = 0 then raise exception 'recommendation version is required'; end if;
  if v_verification_state not in ('VERIFIED','FAILED','INCONCLUSIVE') then raise exception 'invalid verification state'; end if;
  if v_outcome_type not in ('EFFECTIVE','INEFFECTIVE','PARTIAL','ROLLED_BACK','REJECTED','POLICY_BLOCKED','FAILED','UNKNOWN') then raise exception 'invalid outcome type'; end if;
  if p_effectiveness is not null and (p_effectiveness < 0 or p_effectiveness > 1) then raise exception 'effectiveness must be between 0 and 1'; end if;

  select * into v_action
  from governance.autonomy_actions
  where id = p_autonomy_action_id and project_id = p_project_id;
  if not found then raise exception 'governed autonomy action not found in project'; end if;

  if not exists (
    select 1 from governance.autonomy_policy_versions pv
    where pv.id = v_action.policy_version_id
      and pv.policy_id = v_action.policy_id
      and pv.project_id = p_project_id
  ) then
    raise exception 'governed action policy version is invalid for project';
  end if;

  if v_action.approval_workflow_instance_id is not null then
    select wi.status into v_workflow_status
    from governance.workflow_instances wi
    where wi.id = v_action.approval_workflow_instance_id and wi.project_id = p_project_id;
    if v_workflow_status is null then raise exception 'approval workflow is missing from project'; end if;
  end if;

  if v_action.status in ('EXECUTED','ROLLED_BACK','FAILED') then
    if v_action.approval_workflow_instance_id is not null and v_workflow_status <> 'APPROVED' then
      raise exception 'executed governed action does not have authoritative approval';
    end if;
    v_decision_state := case when v_action.approval_workflow_instance_id is null then 'NOT_REQUIRED' else 'APPROVED' end;
    v_execution_state := case v_action.status when 'ROLLED_BACK' then 'ROLLED_BACK' when 'FAILED' then 'FAILED' else 'EXECUTED' end;
  elsif v_action.status = 'REJECTED' then
    if v_action.approval_workflow_instance_id is null or v_workflow_status not in ('REJECTED','CANCELLED') then
      raise exception 'rejected governed action does not have authoritative workflow rejection';
    end if;
    v_decision_state := 'REJECTED';
    v_execution_state := 'NOT_EXECUTED';
    v_verification_state := 'VERIFIED';
    v_outcome_type := 'REJECTED';
    p_effectiveness := null;
  elsif v_action.status = 'BLOCKED' then
    v_decision_state := 'POLICY_DENIED';
    v_execution_state := 'NOT_EXECUTED';
    v_verification_state := 'VERIFIED';
    v_outcome_type := 'POLICY_BLOCKED';
    p_effectiveness := null;
  else
    raise exception 'governed action must reach a terminal execution or decision state before outcome recording';
  end if;

  if v_verification_state = 'VERIFIED' and v_execution_state in ('EXECUTED','ROLLED_BACK','FAILED') then
    if p_before_evidence is null or jsonb_typeof(p_before_evidence) <> 'object' or p_before_evidence = '{}'::jsonb then
      raise exception 'verified executed outcome requires before evidence';
    end if;
    if p_after_evidence is null or jsonb_typeof(p_after_evidence) <> 'object' or p_after_evidence = '{}'::jsonb then
      raise exception 'verified executed outcome requires after evidence';
    end if;
    if p_effectiveness is null then raise exception 'verified executed outcome requires effectiveness'; end if;
    if v_outcome_type not in ('EFFECTIVE','INEFFECTIVE','PARTIAL','ROLLED_BACK','FAILED') then
      raise exception 'verified executed outcome has incompatible outcome type';
    end if;
  end if;

  if v_verification_state <> 'VERIFIED' and v_outcome_type in ('EFFECTIVE','INEFFECTIVE','PARTIAL') then
    raise exception 'effectiveness claims require verified outcome evidence';
  end if;

  if v_action.source_agent_run_id is not null and not exists (
    select 1 from agent.agent_runs ar where ar.id = v_action.source_agent_run_id and ar.project_id = p_project_id
  ) then raise exception 'source agent run is outside project'; end if;

  if p_verification_agent_run_id is not null and not exists (
    select 1 from agent.agent_runs ar where ar.id = p_verification_agent_run_id and ar.project_id = p_project_id and ar.status = 'SUCCEEDED'
  ) then raise exception 'verification agent run must be a successful run in the same project'; end if;

  select * into v_existing
  from governance.governed_action_outcomes
  where project_id = p_project_id
    and autonomy_action_id = p_autonomy_action_id
    and verification_key = trim(p_verification_key);
  if found then
    if v_existing.verification_state <> v_verification_state
       or v_existing.outcome_type <> v_outcome_type
       or v_existing.effectiveness is distinct from p_effectiveness
       or v_existing.after_evidence is distinct from coalesce(p_after_evidence,'{}'::jsonb) then
      raise exception 'verification key reuse does not match immutable governed outcome evidence';
    end if;
    return v_existing.id;
  end if;

  insert into governance.governed_action_outcomes(
    project_id, autonomy_action_id, verification_key, source_agent_run_id, verification_agent_run_id,
    policy_id, policy_version_id, approval_workflow_instance_id,
    recommendation_type, recommendation_version, recommendation,
    decision_state, decision_reason, execution_state, executed_action,
    evidence_context, before_evidence, after_evidence, verification_state, outcome_type,
    effectiveness, runtime_evidence, actor_user_id, verified_at
  ) values (
    p_project_id, p_autonomy_action_id, trim(p_verification_key), v_action.source_agent_run_id, p_verification_agent_run_id,
    v_action.policy_id, v_action.policy_version_id, v_action.approval_workflow_instance_id,
    upper(trim(p_recommendation_type)), trim(p_recommendation_version), coalesce(p_recommendation,'{}'::jsonb),
    v_decision_state, coalesce(nullif(trim(p_decision_reason),''), v_action.error_message), v_execution_state,
    jsonb_build_object('action_key',v_action.action_key,'target_type',v_action.target_type,'target_id',v_action.target_id,'result',v_action.result,'executed_at',v_action.executed_at,'rolled_back_at',v_action.rolled_back_at),
    coalesce(p_evidence_context,'{}'::jsonb), coalesce(p_before_evidence,'{}'::jsonb), coalesce(p_after_evidence,'{}'::jsonb),
    v_verification_state, v_outcome_type, p_effectiveness, coalesce(p_runtime_evidence,'{}'::jsonb), p_actor_user_id,
    case when v_verification_state = 'VERIFIED' then now() else null end
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function governance.record_governed_action_outcome(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,numeric,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function governance.record_governed_action_outcome(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,text,text,numeric,uuid,uuid,text,jsonb) to service_role;

create or replace function governance.promote_verified_governed_action_outcome(p_outcome_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, governance, agent, app
as $$
declare
  v_outcome governance.governed_action_outcomes%rowtype;
  v_action governance.autonomy_actions%rowtype;
  v_agent_definition_id uuid;
  v_case_id uuid;
  v_case_key text;
begin
  select * into v_outcome from governance.governed_action_outcomes where id = p_outcome_id;
  if not found then raise exception 'governed action outcome not found'; end if;
  if v_outcome.verification_state <> 'VERIFIED' then raise exception 'only verified governed outcomes may be promoted'; end if;
  if v_outcome.source_agent_run_id is null then raise exception 'learning promotion requires source agent provenance'; end if;

  select * into v_action from governance.autonomy_actions
  where id = v_outcome.autonomy_action_id and project_id = v_outcome.project_id;
  if not found then raise exception 'governed action is unavailable for learning promotion'; end if;
  if v_action.policy_id <> v_outcome.policy_id or v_action.policy_version_id <> v_outcome.policy_version_id then
    raise exception 'outcome policy evidence no longer matches governed action';
  end if;

  select ar.agent_definition_id into v_agent_definition_id
  from agent.agent_runs ar
  where ar.id = v_outcome.source_agent_run_id and ar.project_id = v_outcome.project_id;
  if v_agent_definition_id is null then raise exception 'source agent provenance is invalid'; end if;

  v_case_key := 'governed-action-outcome:' || v_outcome.id::text;
  insert into agent.agent_learning_cases(
    project_id, agent_definition_id, source_agent_run_id, case_key, source_kind, problem_type,
    context, recommendation, decision_status, outcome_status, effectiveness, confidence, evidence, status, occurred_at
  ) values (
    v_outcome.project_id, v_agent_definition_id, v_outcome.source_agent_run_id, v_case_key,
    'GOVERNED_ACTION_OUTCOME', v_outcome.recommendation_type,
    jsonb_build_object(
      'governed_action_outcome_id',v_outcome.id,
      'autonomy_action_id',v_outcome.autonomy_action_id,
      'action_key',v_action.action_key,
      'target_type',v_action.target_type,
      'target_id',v_action.target_id,
      'decision_state',v_outcome.decision_state,
      'execution_state',v_outcome.execution_state,
      'outcome_type',v_outcome.outcome_type
    ),
    v_outcome.recommendation,
    'VERIFIED','VERIFIED',v_outcome.effectiveness,v_action.confidence,
    jsonb_build_object(
      'governed_action_outcome_id',v_outcome.id,
      'autonomy_action_id',v_outcome.autonomy_action_id,
      'policy_id',v_outcome.policy_id,
      'policy_version_id',v_outcome.policy_version_id,
      'approval_workflow_instance_id',v_outcome.approval_workflow_instance_id,
      'verification_agent_run_id',v_outcome.verification_agent_run_id,
      'verification_key',v_outcome.verification_key,
      'verified_at',v_outcome.verified_at,
      'synthetic_bootstrap',false
    ),
    'ACTIVE',v_outcome.verified_at
  )
  on conflict (project_id,case_key) do nothing
  returning id into v_case_id;

  if v_case_id is null then
    select id into v_case_id from agent.agent_learning_cases
    where project_id = v_outcome.project_id and case_key = v_case_key
      and decision_status = 'VERIFIED' and outcome_status = 'VERIFIED' and status = 'ACTIVE';
  end if;
  if v_case_id is null then raise exception 'verified learning case could not be resolved'; end if;
  return v_case_id;
end;
$$;

revoke all on function governance.promote_verified_governed_action_outcome(uuid) from public, anon, authenticated;
grant execute on function governance.promote_verified_governed_action_outcome(uuid) to service_role;

-- Close the lower-level learning search bypass. Reusable cases must meet the
-- same verified-decision / verified-outcome contract as CanonicalMemoryProvider.
create or replace function agent.search_learning_cases(p_project_id uuid, p_query text, p_limit integer default 10)
returns table(id uuid, case_key text, source_kind text, problem_type text, recommendation jsonb, outcome_status text, effectiveness numeric, confidence numeric, evidence jsonb, relevance numeric)
language sql
stable
set search_path = agent, public
as $$
  with q as (select lower(trim(coalesce(p_query,''))) value)
  select lc.id,lc.case_key,lc.source_kind,lc.problem_type,lc.recommendation,lc.outcome_status,
         lc.effectiveness,lc.confidence,lc.evidence,
         (
           case when lower(lc.problem_type)=q.value then 1.0 else 0 end +
           case when lower(lc.problem_type) like '%'||q.value||'%' then 0.7 else 0 end +
           case when lower(lc.context::text) like '%'||q.value||'%' then 0.4 else 0 end +
           case when lower(lc.recommendation::text) like '%'||q.value||'%' then 0.35 else 0 end +
           case when lower(lc.evidence::text) like '%'||q.value||'%' then 0.2 else 0 end
         )::numeric relevance
  from agent.agent_learning_cases lc cross join q
  where lc.project_id=p_project_id
    and lc.status='ACTIVE'
    and lc.decision_status='VERIFIED'
    and lc.outcome_status='VERIFIED'
    and lc.source_agent_run_id is not null
    and q.value<>''
    and (
      lower(lc.problem_type) like '%'||q.value||'%' or
      lower(lc.context::text) like '%'||q.value||'%' or
      lower(lc.recommendation::text) like '%'||q.value||'%' or
      lower(lc.evidence::text) like '%'||q.value||'%'
    )
  order by relevance desc,coalesce(lc.effectiveness,-1) desc,lc.updated_at desc
  limit greatest(1,least(coalesce(p_limit,10),50));
$$;
