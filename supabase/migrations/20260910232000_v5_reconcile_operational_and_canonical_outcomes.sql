-- V5 authority reconciliation.
-- autonomy_action_outcomes is mutable operational verification state.
-- governed_action_outcomes is immutable canonical outcome evidence and the only
-- authority from which AUTONOMY_ACTION_OUTCOME learning may be retrieved.

alter table governance.autonomy_action_outcomes
  add column if not exists canonical_outcome_id uuid null
    references governance.governed_action_outcomes(id) on delete restrict;

create index if not exists autonomy_action_outcomes_issue_idx
  on governance.autonomy_action_outcomes(issue_id)
  where issue_id is not null;

create index if not exists autonomy_action_outcomes_verified_by_idx
  on governance.autonomy_action_outcomes(verified_by)
  where verified_by is not null;

create index if not exists autonomy_action_outcomes_canonical_idx
  on governance.autonomy_action_outcomes(canonical_outcome_id)
  where canonical_outcome_id is not null;

comment on table governance.autonomy_action_outcomes is
  'Mutable operational verification state. Reusable learning requires a linked immutable governance.governed_action_outcomes record.';
comment on column governance.autonomy_action_outcomes.canonical_outcome_id is
  'Immutable canonical outcome evidence authorizing learning reuse after final verification.';

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
  v_existing_source_agent_run_id uuid;
begin
  select * into v_outcome
  from governance.governed_action_outcomes
  where id = p_outcome_id;
  if not found then raise exception 'governed action outcome not found'; end if;
  if v_outcome.verification_state <> 'VERIFIED' then
    raise exception 'only verified governed outcomes may be promoted';
  end if;
  if v_outcome.source_agent_run_id is null then
    raise exception 'learning promotion requires source agent provenance';
  end if;

  select * into v_action
  from governance.autonomy_actions
  where id = v_outcome.autonomy_action_id
    and project_id = v_outcome.project_id;
  if not found then raise exception 'governed action is unavailable for learning promotion'; end if;
  if v_action.policy_id <> v_outcome.policy_id
     or v_action.policy_version_id <> v_outcome.policy_version_id then
    raise exception 'outcome policy evidence no longer matches governed action';
  end if;

  select ar.agent_definition_id into v_agent_definition_id
  from agent.agent_runs ar
  where ar.id = v_outcome.source_agent_run_id
    and ar.project_id = v_outcome.project_id;
  if v_agent_definition_id is null then raise exception 'source agent provenance is invalid'; end if;

  -- One action has one reusable case. Operational verification may create the
  -- row first, but it is excluded from retrieval until canonical evidence is
  -- merged into it below.
  v_case_key := 'autonomy-action:' || v_outcome.autonomy_action_id::text;

  select id, source_agent_run_id
    into v_case_id, v_existing_source_agent_run_id
  from agent.agent_learning_cases
  where project_id = v_outcome.project_id
    and case_key = v_case_key;

  if v_case_id is not null then
    if v_existing_source_agent_run_id is distinct from v_outcome.source_agent_run_id then
      raise exception 'existing learning case provenance does not match canonical governed outcome';
    end if;

    update agent.agent_learning_cases
    set agent_definition_id = v_agent_definition_id,
        source_agent_run_id = v_outcome.source_agent_run_id,
        source_kind = 'GOVERNED_ACTION_OUTCOME',
        problem_type = v_outcome.recommendation_type,
        context = jsonb_build_object(
          'governed_action_outcome_id',v_outcome.id,
          'autonomy_action_id',v_outcome.autonomy_action_id,
          'action_key',v_action.action_key,
          'target_type',v_action.target_type,
          'target_id',v_action.target_id,
          'decision_state',v_outcome.decision_state,
          'execution_state',v_outcome.execution_state,
          'outcome_type',v_outcome.outcome_type
        ),
        recommendation = v_outcome.recommendation,
        decision_status = 'VERIFIED',
        outcome_status = 'VERIFIED',
        effectiveness = v_outcome.effectiveness,
        confidence = v_action.confidence,
        evidence = coalesce(evidence,'{}'::jsonb) || jsonb_build_object(
          'governed_action_outcome_id',v_outcome.id,
          'autonomy_action_id',v_outcome.autonomy_action_id,
          'policy_id',v_outcome.policy_id,
          'policy_version_id',v_outcome.policy_version_id,
          'approval_workflow_instance_id',v_outcome.approval_workflow_instance_id,
          'verification_agent_run_id',v_outcome.verification_agent_run_id,
          'verification_key',v_outcome.verification_key,
          'verified_at',v_outcome.verified_at,
          'authority','IMMUTABLE_GOVERNED_ACTION_OUTCOME',
          'synthetic_bootstrap',false
        ),
        status = 'ACTIVE',
        occurred_at = v_outcome.verified_at,
        updated_at = now()
    where id = v_case_id;
  else
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
        'authority','IMMUTABLE_GOVERNED_ACTION_OUTCOME',
        'synthetic_bootstrap',false
      ),
      'ACTIVE',v_outcome.verified_at
    ) returning id into v_case_id;
  end if;

  if v_case_id is null then raise exception 'verified learning case could not be resolved'; end if;
  return v_case_id;
end;
$$;

revoke all on function governance.promote_verified_governed_action_outcome(uuid)
  from public, anon, authenticated;
grant execute on function governance.promote_verified_governed_action_outcome(uuid)
  to service_role;

-- Prevent the mutable operational projection from becoming independently
-- retrievable learning. AUTONOMY_ACTION_OUTCOME cases are visible only after
-- immutable canonical outcome provenance has been attached.
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
    and (
      lc.source_kind <> 'AUTONOMY_ACTION_OUTCOME'
      or lc.evidence ? 'governed_action_outcome_id'
    )
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
