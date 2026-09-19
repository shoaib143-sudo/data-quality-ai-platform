-- Phase 11 Governed Learning Pipeline: canonical learning candidates.
-- Candidates are evidence-bound proposals only. This migration intentionally
-- exposes no self-promotion, approval, canary, ACTIVE, or production mutation path.

create table if not exists agent.learning_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  candidate_key text not null,
  candidate_type text not null check (candidate_type in ('SKILL_IMPROVEMENT')),
  agent_key text not null check (agent_key in (
    'profiling_agent','data_quality_agent','steward_agent','governance_analyst_agent',
    'architect_agent','investigator_agent','executive_agent','support_agent'
  )),
  skill_key text not null check (skill_key in (
    'profile_evidence_analysis','profile_gap_detection','quality_rule_analysis',
    'quality_remediation_proposal','stewardship_gap_analysis','governance_evidence_synthesis',
    'lineage_impact_analysis','incident_root_cause_analysis','executive_materiality_analysis',
    'support_case_investigation'
  )),
  category text not null check (category in (
    'OUTPUT_CONTRACT','EVIDENCE_GROUNDING','TOOL_CONTRACT','AUTHORITY_GUARDRAIL',
    'CONFIDENCE_CALIBRATION','HANDOFF_CONTRACT','QUALITY_EVALUATION','RESOURCE_EFFICIENCY'
  )),
  title text not null,
  proposed_change text not null,
  baseline_version text not null,
  candidate_version text not null,
  evidence_cutoff_at timestamptz not null,
  source_agent_run_id uuid references agent.agent_runs(id) on delete restrict,
  may_auto_apply boolean not null default false check (may_auto_apply = false),
  may_self_promote boolean not null default false check (may_self_promote = false),
  may_expand_tool_authority boolean not null default false check (may_expand_tool_authority = false),
  may_change_mutation_boundary boolean not null default false check (may_change_mutation_boundary = false),
  requires_human_review boolean not null default true check (requires_human_review = true),
  current_authorization_required_at_release boolean not null default true check (current_authorization_required_at_release = true),
  status text not null default 'PROPOSED' check (status in (
    'PROPOSED','EVIDENCE_READY','BENCHMARKING','NOT_READY','REVIEW_REQUIRED',
    'APPROVED_FOR_CONTROLLED_RELEASE','REJECTED','CANARY','VERIFIED','ACTIVE',
    'ROLLED_BACK','SUPERSEDED','RETIRED'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_candidates_key_ck check (length(btrim(candidate_key)) > 0 and length(candidate_key) <= 2048),
  constraint learning_candidates_title_ck check (length(btrim(title)) > 0),
  constraint learning_candidates_change_ck check (length(btrim(proposed_change)) > 0),
  constraint learning_candidates_baseline_ck check (length(btrim(baseline_version)) > 0),
  constraint learning_candidates_candidate_ck check (length(btrim(candidate_version)) > 0),
  constraint learning_candidates_version_change_ck check (baseline_version <> candidate_version),
  constraint learning_candidates_project_key_uq unique (project_id, candidate_key),
  constraint learning_candidates_id_project_uq unique (id, project_id)
);

create index if not exists learning_candidates_project_status_idx
  on agent.learning_candidates(project_id, status, created_at desc);
create index if not exists learning_candidates_agent_skill_idx
  on agent.learning_candidates(project_id, agent_key, skill_key, created_at desc);
create index if not exists learning_candidates_source_run_idx
  on agent.learning_candidates(source_agent_run_id)
  where source_agent_run_id is not null;

create table if not exists agent.learning_candidate_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  candidate_id uuid not null,
  evidence_ref text not null,
  evidence_type text not null check (evidence_type in ('AGENT_SKILL_EVALUATION')),
  source_record_type text not null,
  source_record_id text not null,
  observed_at timestamptz not null,
  evidence_available_at timestamptz not null,
  synthetic boolean,
  production_eligible boolean not null default false,
  created_at timestamptz not null default now(),
  constraint learning_candidate_evidence_ref_ck check (length(btrim(evidence_ref)) > 0),
  constraint learning_candidate_evidence_source_type_ck check (length(btrim(source_record_type)) > 0),
  constraint learning_candidate_evidence_source_id_ck check (length(btrim(source_record_id)) > 0),
  constraint learning_candidate_evidence_time_ck check (evidence_available_at >= observed_at),
  constraint learning_candidate_evidence_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint learning_candidate_evidence_uq unique (candidate_id, evidence_ref)
);

create index if not exists learning_candidate_evidence_project_candidate_idx
  on agent.learning_candidate_evidence(project_id, candidate_id, observed_at desc);
create index if not exists learning_candidate_evidence_source_idx
  on agent.learning_candidate_evidence(source_record_type, source_record_id);

create table if not exists agent.learning_candidate_transitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  candidate_id uuid not null,
  from_status text,
  to_status text not null,
  reason text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint learning_candidate_transition_from_ck check (
    from_status is null or from_status in (
      'PROPOSED','EVIDENCE_READY','BENCHMARKING','NOT_READY','REVIEW_REQUIRED',
      'APPROVED_FOR_CONTROLLED_RELEASE','REJECTED','CANARY','VERIFIED','ACTIVE',
      'ROLLED_BACK','SUPERSEDED','RETIRED'
    )
  ),
  constraint learning_candidate_transition_to_ck check (to_status in (
    'PROPOSED','EVIDENCE_READY','BENCHMARKING','NOT_READY','REVIEW_REQUIRED',
    'APPROVED_FOR_CONTROLLED_RELEASE','REJECTED','CANARY','VERIFIED','ACTIVE',
    'ROLLED_BACK','SUPERSEDED','RETIRED'
  )),
  constraint learning_candidate_transition_reason_ck check (length(btrim(reason)) > 0),
  constraint learning_candidate_transition_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade
);

create index if not exists learning_candidate_transitions_project_candidate_idx
  on agent.learning_candidate_transitions(project_id, candidate_id, created_at desc);

alter table agent.learning_candidates enable row level security;
alter table agent.learning_candidate_evidence enable row level security;
alter table agent.learning_candidate_transitions enable row level security;

drop policy if exists learning_candidates_project_read on agent.learning_candidates;
create policy learning_candidates_project_read
  on agent.learning_candidates for select to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists learning_candidate_evidence_project_read on agent.learning_candidate_evidence;
create policy learning_candidate_evidence_project_read
  on agent.learning_candidate_evidence for select to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists learning_candidate_transitions_project_read on agent.learning_candidate_transitions;
create policy learning_candidate_transitions_project_read
  on agent.learning_candidate_transitions for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.learning_candidates from public, anon, authenticated, service_role;
revoke all on agent.learning_candidate_evidence from public, anon, authenticated, service_role;
revoke all on agent.learning_candidate_transitions from public, anon, authenticated, service_role;
grant select on agent.learning_candidates to authenticated, service_role;
grant select on agent.learning_candidate_evidence to authenticated, service_role;
grant select on agent.learning_candidate_transitions to authenticated, service_role;

create or replace function agent.reject_learning_candidate_evidence_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, agent
as $$
begin
  raise exception 'Governed learning evidence is append-only';
end;
$$;

revoke all on function agent.reject_learning_candidate_evidence_mutation() from public, anon, authenticated, service_role;

drop trigger if exists reject_learning_candidate_evidence_mutation on agent.learning_candidate_evidence;
create trigger reject_learning_candidate_evidence_mutation
before update or delete on agent.learning_candidate_evidence
for each row execute function agent.reject_learning_candidate_evidence_mutation();

drop trigger if exists reject_learning_candidate_transition_mutation on agent.learning_candidate_transitions;
create trigger reject_learning_candidate_transition_mutation
before update or delete on agent.learning_candidate_transitions
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create or replace function agent.create_learning_candidate(
  p_project_id uuid,
  p_candidate_key text,
  p_candidate_type text,
  p_agent_key text,
  p_skill_key text,
  p_category text,
  p_title text,
  p_proposed_change text,
  p_baseline_version text,
  p_candidate_version text,
  p_evidence_cutoff_at timestamptz,
  p_evidence_refs text[],
  p_source_agent_run_id uuid default null,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance, app
as $$
declare
  v_candidate agent.learning_candidates%rowtype;
  v_eval governance.ai_evaluation_results%rowtype;
  v_ref text;
  v_normalized_refs text[];
  v_existing_refs text[];
  v_synthetic boolean;
  v_production_eligible boolean;
begin
  if p_project_id is null then raise exception 'projectId is required'; end if;
  if length(btrim(coalesce(p_candidate_key,''))) = 0 then raise exception 'candidateKey is required'; end if;
  if p_candidate_type <> 'SKILL_IMPROVEMENT' then raise exception 'unsupported learning candidate type'; end if;
  if length(btrim(coalesce(p_title,''))) = 0 then raise exception 'title is required'; end if;
  if length(btrim(coalesce(p_proposed_change,''))) = 0 then raise exception 'proposedChange is required'; end if;
  if length(btrim(coalesce(p_baseline_version,''))) = 0 then raise exception 'baselineVersion is required'; end if;
  if length(btrim(coalesce(p_candidate_version,''))) = 0 then raise exception 'candidateVersion is required'; end if;
  if btrim(p_baseline_version) = btrim(p_candidate_version) then raise exception 'candidateVersion must differ from baselineVersion'; end if;
  if p_evidence_cutoff_at is null then raise exception 'evidenceCutoffAt is required'; end if;

  if not (
    (p_agent_key = 'profiling_agent' and p_skill_key in ('profile_evidence_analysis','profile_gap_detection'))
    or (p_agent_key = 'data_quality_agent' and p_skill_key in ('profile_gap_detection','quality_rule_analysis','quality_remediation_proposal'))
    or (p_agent_key = 'steward_agent' and p_skill_key in ('stewardship_gap_analysis','governance_evidence_synthesis'))
    or (p_agent_key = 'governance_analyst_agent' and p_skill_key in ('quality_rule_analysis','stewardship_gap_analysis','governance_evidence_synthesis','lineage_impact_analysis'))
    or (p_agent_key = 'architect_agent' and p_skill_key = 'lineage_impact_analysis')
    or (p_agent_key = 'investigator_agent' and p_skill_key in ('profile_gap_detection','quality_rule_analysis','lineage_impact_analysis','incident_root_cause_analysis'))
    or (p_agent_key = 'executive_agent' and p_skill_key in ('governance_evidence_synthesis','executive_materiality_analysis'))
    or (p_agent_key = 'support_agent' and p_skill_key in ('lineage_impact_analysis','support_case_investigation'))
  ) then
    raise exception 'skill is not authorized for governed agent';
  end if;

  if p_category not in (
    'OUTPUT_CONTRACT','EVIDENCE_GROUNDING','TOOL_CONTRACT','AUTHORITY_GUARDRAIL',
    'CONFIDENCE_CALIBRATION','HANDOFF_CONTRACT','QUALITY_EVALUATION','RESOURCE_EFFICIENCY'
  ) then raise exception 'unsupported learning candidate category'; end if;

  if p_source_agent_run_id is not null and not exists (
    select 1 from agent.agent_runs ar
    where ar.id = p_source_agent_run_id and ar.project_id = p_project_id
  ) then
    raise exception 'source agent run is outside project';
  end if;

  if p_evidence_refs is null or cardinality(p_evidence_refs) = 0 then
    raise exception 'persisted evaluation evidence is required';
  end if;
  if exists (
    select 1 from unnest(p_evidence_refs) as ref
    where ref is null or length(btrim(ref)) = 0 or ref <> btrim(ref)
  ) then
    raise exception 'evidence references must be non-empty normalized identifiers';
  end if;
  select array_agg(distinct ref order by ref)
  into v_normalized_refs
  from unnest(p_evidence_refs) as ref;
  if cardinality(v_normalized_refs) <> cardinality(p_evidence_refs) then
    raise exception 'duplicate evidence references are not allowed';
  end if;

  select * into v_candidate
  from agent.learning_candidates
  where project_id = p_project_id and candidate_key = btrim(p_candidate_key);

  if found then
    if v_candidate.candidate_type <> p_candidate_type
      or v_candidate.agent_key <> p_agent_key
      or v_candidate.skill_key <> p_skill_key
      or v_candidate.category <> p_category
      or v_candidate.title <> btrim(p_title)
      or v_candidate.proposed_change <> btrim(p_proposed_change)
      or v_candidate.baseline_version <> btrim(p_baseline_version)
      or v_candidate.candidate_version <> btrim(p_candidate_version)
      or v_candidate.evidence_cutoff_at <> p_evidence_cutoff_at
      or v_candidate.source_agent_run_id is distinct from p_source_agent_run_id
    then
      raise exception 'candidate key reuse does not match immutable governed candidate payload';
    end if;

    select array_agg(evidence_ref order by evidence_ref)
    into v_existing_refs
    from agent.learning_candidate_evidence
    where candidate_id = v_candidate.id and project_id = p_project_id;
    if v_existing_refs is distinct from v_normalized_refs then
      raise exception 'candidate key reuse does not match immutable evidence set';
    end if;
    return v_candidate.id;
  end if;

  -- Validate the complete evidence set before creating any candidate state.
  foreach v_ref in array v_normalized_refs loop
    select * into v_eval
    from governance.ai_evaluation_results
    where id::text = v_ref
      and project_id = p_project_id
      and evaluation_type = 'AGENT_SKILL'
      and capability = 'agent_skill:' || p_agent_key || ':' || p_skill_key;

    if not found then
      raise exception 'learning candidate evidence is missing, cross-project, or outside the governed agent skill capability: %', v_ref;
    end if;
    if v_eval.observed_at > p_evidence_cutoff_at or v_eval.created_at > p_evidence_cutoff_at then
      raise exception 'learning candidate evidence is not available at evidence cutoff: %', v_ref;
    end if;
  end loop;

  insert into agent.learning_candidates(
    project_id, candidate_key, candidate_type, agent_key, skill_key, category,
    title, proposed_change, baseline_version, candidate_version, evidence_cutoff_at,
    source_agent_run_id, may_auto_apply, may_self_promote, may_expand_tool_authority,
    may_change_mutation_boundary, requires_human_review, current_authorization_required_at_release, status
  ) values (
    p_project_id, btrim(p_candidate_key), p_candidate_type, p_agent_key, p_skill_key, p_category,
    btrim(p_title), btrim(p_proposed_change), btrim(p_baseline_version), btrim(p_candidate_version),
    p_evidence_cutoff_at, p_source_agent_run_id, false, false, false, false, true, true, 'PROPOSED'
  )
  returning * into v_candidate;

  foreach v_ref in array v_normalized_refs loop
    select * into v_eval
    from governance.ai_evaluation_results
    where id::text = v_ref and project_id = p_project_id;

    v_synthetic := case
      when lower(coalesce(v_eval.metadata->>'synthetic', v_eval.metadata->>'synthetic_bootstrap', '')) = 'true' then true
      when lower(coalesce(v_eval.metadata->>'synthetic', v_eval.metadata->>'synthetic_bootstrap', '')) = 'false' then false
      else null
    end;
    v_production_eligible := v_synthetic is false;

    insert into agent.learning_candidate_evidence(
      project_id, candidate_id, evidence_ref, evidence_type, source_record_type, source_record_id,
      observed_at, evidence_available_at, synthetic, production_eligible
    ) values (
      p_project_id, v_candidate.id, v_ref, 'AGENT_SKILL_EVALUATION',
      'governance.ai_evaluation_results', v_eval.id::text,
      v_eval.observed_at, v_eval.created_at, v_synthetic, v_production_eligible
    );
  end loop;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate.id, null, 'PROPOSED',
    'CREATED_FROM_AGENT_SKILL_EVALUATION', p_actor_user_id
  );

  return v_candidate.id;
end;
$$;

revoke all on function agent.create_learning_candidate(
  uuid,text,text,text,text,text,text,text,text,text,timestamptz,text[],uuid,uuid
) from public, anon, authenticated;
grant execute on function agent.create_learning_candidate(
  uuid,text,text,text,text,text,text,text,text,text,timestamptz,text[],uuid,uuid
) to service_role;

create or replace function agent.transition_learning_candidate(
  p_project_id uuid,
  p_candidate_id uuid,
  p_expected_status text,
  p_target_status text,
  p_reason text,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, app
as $$
declare
  v_candidate agent.learning_candidates%rowtype;
  v_evidence_count integer;
  v_ineligible_count integer;
begin
  if p_project_id is null or p_candidate_id is null then raise exception 'project and candidate are required'; end if;
  if length(btrim(coalesce(p_reason,''))) = 0 then raise exception 'transition reason is required'; end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = p_candidate_id and project_id = p_project_id
  for update;
  if not found then raise exception 'learning candidate not found in project'; end if;
  if v_candidate.status <> p_expected_status then
    raise exception 'learning candidate status changed: expected %, found %', p_expected_status, v_candidate.status;
  end if;

  -- First increment deliberately supports evidence qualification or rejection only.
  -- Benchmark, review, controlled release, canary, ACTIVE, and rollback transitions
  -- are added only when their independent authorities are implemented.
  if p_target_status = 'EVIDENCE_READY' then
    if v_candidate.status <> 'PROPOSED' then raise exception 'only PROPOSED candidates may become EVIDENCE_READY'; end if;
    select count(*), count(*) filter (where production_eligible is not true)
    into v_evidence_count, v_ineligible_count
    from agent.learning_candidate_evidence
    where candidate_id = v_candidate.id and project_id = p_project_id;
    if v_evidence_count = 0 then raise exception 'candidate has no persisted evidence'; end if;
    if v_ineligible_count > 0 then
      raise exception 'candidate evidence includes synthetic or unclassified evidence and is not production eligible';
    end if;
  elsif p_target_status = 'REJECTED' then
    if v_candidate.status not in ('PROPOSED','EVIDENCE_READY') then
      raise exception 'candidate cannot be rejected from current lifecycle state';
    end if;
  else
    raise exception 'target lifecycle state is not enabled in governed learning increment 1';
  end if;

  update agent.learning_candidates
  set status = p_target_status, updated_at = now()
  where id = v_candidate.id and project_id = p_project_id;

  insert into agent.learning_candidate_transitions(
    project_id, candidate_id, from_status, to_status, reason, actor_user_id
  ) values (
    p_project_id, v_candidate.id, v_candidate.status, p_target_status, btrim(p_reason), p_actor_user_id
  );

  return v_candidate.id;
end;
$$;

revoke all on function agent.transition_learning_candidate(uuid,uuid,text,text,text,uuid)
  from public, anon, authenticated;
grant execute on function agent.transition_learning_candidate(uuid,uuid,text,text,text,uuid)
  to service_role;

comment on table agent.learning_candidates is
  'Phase 11 governed improvement candidates. A candidate is a proposal backed by evaluation evidence and never grants execution or promotion authority.';
comment on table agent.learning_candidate_evidence is
  'Append-only evidence bound to a governed learning candidate. Unknown or synthetic evidence is fail-closed for production eligibility.';
comment on table agent.learning_candidate_transitions is
  'Append-only lifecycle evidence for governed learning candidates.';
