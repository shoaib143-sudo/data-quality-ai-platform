-- Governed, append-only measured AI red-team evidence.
-- This ledger stores adversarial observations only. It never grants governance authority
-- to model output and does not itself assert PASS for a release.

create table if not exists governance.ai_red_team_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id),
  ai_system_version_id uuid not null references governance.ai_system_versions(id),
  source_commit_sha text not null check (source_commit_sha ~ '^[0-9a-f]{40}$'),
  deployment_id text not null check (length(btrim(deployment_id)) > 0),
  scenario_id text not null check (scenario_id in (
    'PROMPT_INJECTION','RETRIEVAL_POISONING','AUTHORITY_SPOOFING','FABRICATED_EVIDENCE',
    'CROSS_PROJECT_CONTEXT_LEAKAGE','TOOL_ARGUMENT_MANIPULATION','EXCESSIVE_AGENCY',
    'SENSITIVE_DATA_EXTRACTION','POLICY_CIRCUMVENTION','ABSTENTION_FAILURE'
  )),
  evaluator_version text not null check (length(btrim(evaluator_version)) > 0),
  production_representative boolean not null default false,
  observed_at timestamptz not null,
  passed boolean not null,
  authority_escalated boolean not null default false,
  cross_project_leak boolean not null default false,
  tool_boundary_violation boolean not null default false,
  fabricated_authoritative_evidence boolean not null default false,
  sensitive_data_exposed boolean not null default false,
  policy_bypassed boolean not null default false,
  expected_abstain boolean,
  actual_abstain boolean,
  evidence_refs jsonb not null check (jsonb_typeof(evidence_refs) = 'array' and jsonb_array_length(evidence_refs) > 0),
  evidence_hash text not null check (evidence_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint ai_red_team_abstention_shape check (
    scenario_id <> 'ABSTENTION_FAILURE'
    or (expected_abstain is not null and actual_abstain is not null)
  )
);

create index if not exists ai_red_team_release_target_idx
  on governance.ai_red_team_evidence(project_id, ai_system_version_id, source_commit_sha, deployment_id, scenario_id, observed_at desc);

alter table governance.ai_red_team_evidence enable row level security;

revoke all on table governance.ai_red_team_evidence from public, anon, authenticated, service_role;
grant select on table governance.ai_red_team_evidence to service_role;

create or replace function governance.prevent_ai_red_team_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'AI red-team evidence is append-only';
end;
$$;

revoke all on function governance.prevent_ai_red_team_evidence_mutation() from public, anon, authenticated, service_role;

drop trigger if exists ai_red_team_evidence_append_only on governance.ai_red_team_evidence;
create trigger ai_red_team_evidence_append_only
before update or delete on governance.ai_red_team_evidence
for each row execute function governance.prevent_ai_red_team_evidence_mutation();

create or replace function governance.record_ai_red_team_evidence(
  p_project_id uuid,
  p_ai_system_version_id uuid,
  p_source_commit_sha text,
  p_deployment_id text,
  p_scenario_id text,
  p_evaluator_version text,
  p_production_representative boolean,
  p_observed_at timestamptz,
  p_passed boolean,
  p_authority_escalated boolean,
  p_cross_project_leak boolean,
  p_tool_boundary_violation boolean,
  p_fabricated_authoritative_evidence boolean,
  p_sensitive_data_exposed boolean,
  p_policy_bypassed boolean,
  p_expected_abstain boolean,
  p_actual_abstain boolean,
  p_evidence_refs jsonb
)
returns governance.ai_red_team_evidence
language plpgsql
security definer
set search_path = 'pg_catalog','governance','extensions'
as $$
declare
  v_scenario text := upper(btrim(coalesce(p_scenario_id,'')));
  v_evidence jsonb;
  v_hash text;
  v_row governance.ai_red_team_evidence;
begin
  if p_source_commit_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'AI red-team evidence requires an exact source commit SHA';
  end if;
  if coalesce(btrim(p_deployment_id),'') = '' then
    raise exception 'AI red-team evidence requires deployment identity';
  end if;
  if coalesce(btrim(p_evaluator_version),'') = '' then
    raise exception 'AI red-team evidence requires evaluator version';
  end if;
  if v_scenario not in (
    'PROMPT_INJECTION','RETRIEVAL_POISONING','AUTHORITY_SPOOFING','FABRICATED_EVIDENCE',
    'CROSS_PROJECT_CONTEXT_LEAKAGE','TOOL_ARGUMENT_MANIPULATION','EXCESSIVE_AGENCY',
    'SENSITIVE_DATA_EXTRACTION','POLICY_CIRCUMVENTION','ABSTENTION_FAILURE'
  ) then
    raise exception 'Unsupported AI red-team scenario';
  end if;
  if jsonb_typeof(coalesce(p_evidence_refs,'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_evidence_refs) = 0 then
    raise exception 'AI red-team evidence requires evidence references';
  end if;
  if p_observed_at > now() + interval '5 minutes' then
    raise exception 'AI red-team evidence timestamp is unreasonably in the future';
  end if;
  if v_scenario = 'ABSTENTION_FAILURE' and (p_expected_abstain is null or p_actual_abstain is null) then
    raise exception 'Abstention scenario requires expected and actual abstention';
  end if;
  if not exists (
    select 1 from governance.ai_system_versions v
    where v.id = p_ai_system_version_id and v.project_id = p_project_id
  ) then
    raise exception 'AI system version does not belong to the project';
  end if;

  v_evidence := jsonb_build_object(
    'project_id',p_project_id,'ai_system_version_id',p_ai_system_version_id,
    'source_commit_sha',lower(p_source_commit_sha),'deployment_id',p_deployment_id,
    'scenario_id',v_scenario,'evaluator_version',p_evaluator_version,
    'production_representative',coalesce(p_production_representative,false),
    'observed_at',p_observed_at,'passed',coalesce(p_passed,false),
    'authority_escalated',coalesce(p_authority_escalated,false),
    'cross_project_leak',coalesce(p_cross_project_leak,false),
    'tool_boundary_violation',coalesce(p_tool_boundary_violation,false),
    'fabricated_authoritative_evidence',coalesce(p_fabricated_authoritative_evidence,false),
    'sensitive_data_exposed',coalesce(p_sensitive_data_exposed,false),
    'policy_bypassed',coalesce(p_policy_bypassed,false),
    'expected_abstain',p_expected_abstain,'actual_abstain',p_actual_abstain,
    'evidence_refs',p_evidence_refs
  );
  v_hash := 'sha256:' || encode(extensions.digest(convert_to(v_evidence::text,'UTF8'),'sha256'),'hex');

  insert into governance.ai_red_team_evidence(
    project_id,ai_system_version_id,source_commit_sha,deployment_id,scenario_id,evaluator_version,
    production_representative,observed_at,passed,authority_escalated,cross_project_leak,
    tool_boundary_violation,fabricated_authoritative_evidence,sensitive_data_exposed,policy_bypassed,
    expected_abstain,actual_abstain,evidence_refs,evidence_hash
  ) values (
    p_project_id,p_ai_system_version_id,lower(p_source_commit_sha),btrim(p_deployment_id),v_scenario,btrim(p_evaluator_version),
    coalesce(p_production_representative,false),p_observed_at,coalesce(p_passed,false),coalesce(p_authority_escalated,false),
    coalesce(p_cross_project_leak,false),coalesce(p_tool_boundary_violation,false),coalesce(p_fabricated_authoritative_evidence,false),
    coalesce(p_sensitive_data_exposed,false),coalesce(p_policy_bypassed,false),p_expected_abstain,p_actual_abstain,p_evidence_refs,v_hash
  ) returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function governance.record_ai_red_team_evidence(uuid,uuid,text,text,text,text,boolean,timestamptz,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,jsonb)
  from public, anon, authenticated;
grant execute on function governance.record_ai_red_team_evidence(uuid,uuid,text,text,text,text,boolean,timestamptz,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,jsonb)
  to service_role;

select pg_notify('pgrst','reload schema');