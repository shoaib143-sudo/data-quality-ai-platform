-- Governed learning-runner activation bindings.
-- Adds append-only, server-owned identities for executable artifacts, replayable
-- held-out inputs, exact runtime arm bindings, and independent evaluator attestation.
-- This migration grants no promotion authority and dispatches no provider work.

create table if not exists agent.learning_artifact_manifests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  artifact_kind text not null check (artifact_kind in ('EXECUTABLE','HELD_OUT_INPUT')),
  artifact_role text not null check (artifact_role in ('BASELINE','CANDIDATE','HELD_OUT_INPUT')),
  agent_definition_id uuid references agent.agent_definitions(id) on delete restrict,
  skill_key text,
  candidate_id uuid,
  dataset_manifest_id uuid,
  case_key text,
  dataset_version_id text,
  object_artifact_id uuid not null references orchestration.object_artifacts(id) on delete restrict,
  provider_key text not null,
  bucket text not null,
  object_key text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^sha256:[a-f0-9]{64}$'),
  serialization_version text not null check (length(btrim(serialization_version)) > 0),
  runtime_version text,
  definition_hash text,
  tool_contract_set_hash text,
  source_ref text not null check (length(btrim(source_ref)) > 0),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  sealed_at timestamptz not null default clock_timestamp(),
  constraint learning_artifact_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id) on delete restrict,
  constraint learning_artifact_case_fk
    foreign key (project_id, dataset_manifest_id, case_key)
    references agent.learning_benchmark_dataset_cases(project_id, dataset_id, case_key) on delete restrict,
  constraint learning_artifact_locator_uq unique(project_id, provider_key, bucket, object_key),
  constraint learning_artifact_object_lifecycle_uq unique(object_artifact_id),
  constraint learning_artifact_owner_shape_ck check (
    (
      artifact_kind='EXECUTABLE'
      and artifact_role in ('BASELINE','CANDIDATE')
      and agent_definition_id is not null
      and skill_key is not null and length(btrim(skill_key)) > 0
      and runtime_version is not null and length(btrim(runtime_version)) > 0
      and definition_hash ~ '^sha256:[a-f0-9]{64}$'
      and tool_contract_set_hash ~ '^sha256:[a-f0-9]{64}$'
      and dataset_manifest_id is null and case_key is null and dataset_version_id is null
    )
    or
    (
      artifact_kind='HELD_OUT_INPUT'
      and artifact_role='HELD_OUT_INPUT'
      and agent_definition_id is null and skill_key is null and candidate_id is null
      and runtime_version is null and definition_hash is null and tool_contract_set_hash is null
      and dataset_manifest_id is not null and case_key is not null
      and dataset_version_id is not null
    )
  ),
  constraint learning_artifact_role_candidate_ck check (
    artifact_kind <> 'EXECUTABLE'
    or (artifact_role='CANDIDATE') = (candidate_id is not null)
  )
);

create unique index if not exists learning_artifact_executable_role_uq
  on agent.learning_artifact_manifests(
    project_id,
    agent_definition_id,
    artifact_role,
    coalesce(candidate_id,'00000000-0000-0000-0000-000000000000'::uuid)
  )
  where artifact_kind='EXECUTABLE';

create unique index if not exists learning_artifact_held_out_case_uq
  on agent.learning_artifact_manifests(project_id,dataset_manifest_id,case_key)
  where artifact_kind='HELD_OUT_INPUT';

create index if not exists learning_artifact_candidate_idx
  on agent.learning_artifact_manifests(project_id,candidate_id)
  where candidate_id is not null;

create index if not exists learning_artifact_definition_fk_idx
  on agent.learning_artifact_manifests(agent_definition_id)
  where agent_definition_id is not null;
create index if not exists learning_artifact_candidate_fk_idx
  on agent.learning_artifact_manifests(candidate_id,project_id)
  where candidate_id is not null;
create index if not exists learning_artifact_case_fk_idx
  on agent.learning_artifact_manifests(project_id,dataset_manifest_id,case_key)
  where dataset_manifest_id is not null;
create index if not exists learning_artifact_created_by_fk_idx
  on agent.learning_artifact_manifests(created_by)
  where created_by is not null;

alter table agent.learning_artifact_manifests enable row level security;
revoke all on agent.learning_artifact_manifests from public,anon,authenticated,service_role;
grant select on agent.learning_artifact_manifests to service_role;
create policy learning_artifact_manifests_authenticated_deny
  on agent.learning_artifact_manifests for all to authenticated
  using (false) with check (false);

create table if not exists agent.learning_evaluation_runtime_bindings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  policy_id uuid not null,
  candidate_id uuid not null,
  baseline_agent_definition_id uuid not null references agent.agent_definitions(id) on delete restrict,
  candidate_agent_definition_id uuid not null references agent.agent_definitions(id) on delete restrict,
  rollback_agent_definition_id uuid not null references agent.agent_definitions(id) on delete restrict,
  baseline_artifact_id uuid not null references agent.learning_artifact_manifests(id) on delete restrict,
  candidate_artifact_id uuid not null references agent.learning_artifact_manifests(id) on delete restrict,
  baseline_runtime_hash text not null check (baseline_runtime_hash ~ '^sha256:[a-f0-9]{64}$'),
  candidate_runtime_hash text not null check (candidate_runtime_hash ~ '^sha256:[a-f0-9]{64}$'),
  binding_hash text not null check (binding_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  constraint learning_runtime_binding_policy_fk
    foreign key(policy_id,project_id)
    references agent.learning_evaluation_policies(id,project_id) on delete restrict,
  constraint learning_runtime_binding_candidate_fk
    foreign key(candidate_id,project_id)
    references agent.learning_candidates(id,project_id) on delete restrict,
  constraint learning_runtime_binding_policy_uq unique(project_id,policy_id),
  constraint learning_runtime_binding_distinct_ck check (
    baseline_agent_definition_id <> candidate_agent_definition_id
    and baseline_artifact_id <> candidate_artifact_id
    and baseline_runtime_hash <> candidate_runtime_hash
  )
);

create index if not exists learning_runtime_binding_candidate_idx
  on agent.learning_evaluation_runtime_bindings(project_id,candidate_id);

create index if not exists learning_runtime_binding_policy_fk_idx
  on agent.learning_evaluation_runtime_bindings(policy_id,project_id);
create index if not exists learning_runtime_binding_candidate_fk_idx
  on agent.learning_evaluation_runtime_bindings(candidate_id,project_id);
create index if not exists learning_runtime_binding_baseline_definition_fk_idx
  on agent.learning_evaluation_runtime_bindings(baseline_agent_definition_id);
create index if not exists learning_runtime_binding_candidate_definition_fk_idx
  on agent.learning_evaluation_runtime_bindings(candidate_agent_definition_id);
create index if not exists learning_runtime_binding_rollback_definition_fk_idx
  on agent.learning_evaluation_runtime_bindings(rollback_agent_definition_id);
create index if not exists learning_runtime_binding_baseline_artifact_fk_idx
  on agent.learning_evaluation_runtime_bindings(baseline_artifact_id);
create index if not exists learning_runtime_binding_candidate_artifact_fk_idx
  on agent.learning_evaluation_runtime_bindings(candidate_artifact_id);

alter table agent.learning_evaluation_runtime_bindings enable row level security;
revoke all on agent.learning_evaluation_runtime_bindings from public,anon,authenticated,service_role;
grant select on agent.learning_evaluation_runtime_bindings to service_role;
create policy learning_runtime_bindings_authenticated_deny
  on agent.learning_evaluation_runtime_bindings for all to authenticated
  using (false) with check (false);

create table if not exists agent.learning_evaluator_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  policy_id uuid not null,
  candidate_id uuid not null,
  proposer_user_id uuid not null references auth.users(id) on delete restrict,
  evaluator_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  scope_hash text not null check (scope_hash ~ '^sha256:[a-f0-9]{64}$'),
  acknowledged_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint learning_evaluator_policy_fk
    foreign key(policy_id,project_id)
    references agent.learning_evaluation_policies(id,project_id) on delete restrict,
  constraint learning_evaluator_candidate_fk
    foreign key(candidate_id,project_id)
    references agent.learning_candidates(id,project_id) on delete restrict,
  constraint learning_evaluator_assignment_uq unique(project_id,policy_id),
  constraint learning_evaluator_independent_ck check (
    proposer_user_id <> evaluator_user_id
    and assigned_by <> evaluator_user_id
  )
);

create index if not exists learning_evaluator_policy_fk_idx
  on agent.learning_evaluator_assignments(policy_id,project_id);
create index if not exists learning_evaluator_candidate_fk_idx
  on agent.learning_evaluator_assignments(candidate_id,project_id);
create index if not exists learning_evaluator_proposer_fk_idx
  on agent.learning_evaluator_assignments(proposer_user_id);
create index if not exists learning_evaluator_evaluator_fk_idx
  on agent.learning_evaluator_assignments(evaluator_user_id);
create index if not exists learning_evaluator_assigned_by_fk_idx
  on agent.learning_evaluator_assignments(assigned_by);

alter table agent.learning_evaluator_assignments enable row level security;
revoke all on agent.learning_evaluator_assignments from public,anon,authenticated,service_role;
grant select on agent.learning_evaluator_assignments to service_role;
create policy learning_evaluator_assignments_authenticated_deny
  on agent.learning_evaluator_assignments for all to authenticated
  using (false) with check (false);

create or replace function agent.reject_learning_activation_binding_mutation()
returns trigger
language plpgsql
set search_path=pg_catalog,agent
as $$
begin
  raise exception 'Learning activation bindings are immutable' using errcode='55000';
end
$$;

revoke all on function agent.reject_learning_activation_binding_mutation()
from public,anon,authenticated,service_role;

create trigger learning_artifact_manifests_immutable
before update or delete on agent.learning_artifact_manifests
for each row execute function agent.reject_learning_activation_binding_mutation();

create trigger learning_runtime_bindings_immutable
before update or delete on agent.learning_evaluation_runtime_bindings
for each row execute function agent.reject_learning_activation_binding_mutation();

create trigger learning_evaluator_assignments_immutable
before update or delete on agent.learning_evaluator_assignments
for each row execute function agent.reject_learning_activation_binding_mutation();

create or replace function agent.protect_learning_artifact_object_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,agent,orchestration
as $$
begin
  if exists(select 1 from agent.learning_artifact_manifests m where m.object_artifact_id=old.id) then
    raise exception 'Referenced learning artifact lifecycle is immutable' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;
revoke all on function agent.protect_learning_artifact_object_lifecycle() from public,anon,authenticated,service_role;

create trigger protect_learning_artifact_object_lifecycle
before update or delete on orchestration.object_artifacts
for each row execute function agent.protect_learning_artifact_object_lifecycle();

create or replace function agent.register_learning_artifact_manifest(
  p_project_id uuid,
  p_object_artifact_id uuid,
  p_artifact_kind text,
  p_artifact_role text,
  p_agent_definition_id uuid,
  p_skill_key text,
  p_candidate_id uuid,
  p_dataset_manifest_id uuid,
  p_case_key text,
  p_dataset_version_id text,
  p_provider_key text,
  p_bucket text,
  p_object_key text,
  p_content_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_serialization_version text,
  p_runtime_version text,
  p_definition_hash text,
  p_tool_contract_set_hash text,
  p_source_ref text,
  p_created_by uuid
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,agent,app
as $$
declare
  v_id uuid;
  v_agent record;
  v_candidate agent.learning_candidates%rowtype;
  v_case agent.learning_benchmark_dataset_cases%rowtype;
  v_manifest agent.learning_benchmark_dataset_manifests%rowtype;
  v_object orchestration.object_artifacts%rowtype;
begin
  if p_project_id is null or p_object_artifact_id is null or p_size_bytes < 0 or p_sha256 !~ '^sha256:[a-f0-9]{64}$' then
    raise exception 'Invalid immutable artifact identity';
  end if;
  if nullif(btrim(coalesce(p_provider_key,'')),'') is null
    or nullif(btrim(coalesce(p_bucket,'')),'') is null
    or nullif(btrim(coalesce(p_object_key,'')),'') is null
    or nullif(btrim(coalesce(p_content_type,'')),'') is null
    or nullif(btrim(coalesce(p_serialization_version,'')),'') is null
    or nullif(btrim(coalesce(p_source_ref,'')),'') is null
  then
    raise exception 'Artifact storage metadata is required';
  end if;

  select * into v_object from orchestration.object_artifacts
  where id=p_object_artifact_id and project_id=p_project_id;
  if not found
    or v_object.provider_key<>btrim(p_provider_key)
    or v_object.bucket<>btrim(p_bucket)
    or v_object.object_key<>btrim(p_object_key)
    or v_object.content_type is distinct from btrim(p_content_type)
    or v_object.size_bytes is distinct from p_size_bytes
    or v_object.lifecycle_status<>'ACTIVE'
    or coalesce(v_object.metadata->>'sha256','')<>p_sha256
    or coalesce(v_object.metadata->>'immutableLearningArtifact','false')<>'true'
  then
    raise exception 'Learning artifact lifecycle registry binding mismatch';
  end if;

  if btrim(p_provider_key)<>'supabase' then
    raise exception 'Learning artifacts must use the governed Supabase object provider';
  end if;
  if btrim(p_content_type)<>'application/json' then
    raise exception 'Learning artifacts must use canonical JSON content';
  end if;
  if btrim(p_object_key)<>(
    'projects/'||p_project_id::text||'/learning/'||lower(p_artifact_kind)||'/'||substr(p_sha256,8)
  ) then
    raise exception 'Learning artifact object key is not content-addressed to its project, kind and digest';
  end if;

  if p_artifact_kind='EXECUTABLE' then
    select d.id,d.agent_key,d.version,l.lifecycle_state into v_agent
    from agent.agent_definitions d
    join agent.agent_version_lifecycle l on l.agent_definition_id=d.id
    where d.id=p_agent_definition_id;
    if not found then raise exception 'Executable agent definition lifecycle not found'; end if;
    if nullif(btrim(coalesce(p_skill_key,'')),'') is null
      or nullif(btrim(coalesce(p_runtime_version,'')),'') is null
      or p_definition_hash !~ '^sha256:[a-f0-9]{64}$'
      or p_tool_contract_set_hash !~ '^sha256:[a-f0-9]{64}$'
    then
      raise exception 'Executable runtime/tool contract evidence is required';
    end if;

    if btrim(p_source_ref)<>('agent-definition:'||p_agent_definition_id::text) then
      raise exception 'Executable artifact source reference mismatch';
    end if;
    if p_artifact_role='BASELINE' then
      if p_candidate_id is not null then raise exception 'Baseline executable cannot be candidate-owned'; end if;
      if v_agent.lifecycle_state not in ('ACTIVE','DEPRECATED') then
        raise exception 'Baseline executable lifecycle is not evaluable';
      end if;
    elsif p_artifact_role='CANDIDATE' then
      select * into v_candidate
      from agent.learning_candidates
      where id=p_candidate_id and project_id=p_project_id;
      if not found then raise exception 'Candidate executable owner not found'; end if;
      if v_candidate.agent_key<>v_agent.agent_key
        or v_candidate.skill_key<>btrim(p_skill_key)
        or v_candidate.candidate_version<>v_agent.version
      then
        raise exception 'Candidate executable does not match candidate agent/skill/version';
      end if;
      if v_agent.lifecycle_state not in ('VALIDATED','CANDIDATE') then
        raise exception 'Candidate executable lifecycle is not evaluable';
      end if;
    else
      raise exception 'Unsupported executable role';
    end if;
  elsif p_artifact_kind='HELD_OUT_INPUT' and p_artifact_role='HELD_OUT_INPUT' then
    select * into v_case
    from agent.learning_benchmark_dataset_cases
    where project_id=p_project_id
      and dataset_id=p_dataset_manifest_id
      and case_key=p_case_key;
    if not found or v_case.split<>'HELD_OUT' then
      raise exception 'Replay artifact must bind a held-out case';
    end if;

    select * into v_manifest
    from agent.learning_benchmark_dataset_manifests
    where id=p_dataset_manifest_id
      and project_id=p_project_id
      and status='SEALED';
    if not found or v_manifest.dataset_version<>p_dataset_version_id then
      raise exception 'Replay artifact dataset version must match the sealed manifest';
    end if;
    if v_case.source_case_ref<>p_source_ref then
      raise exception 'Replay artifact source reference mismatch';
    end if;
  else
    raise exception 'Unsupported learning artifact kind/role';
  end if;

  insert into agent.learning_artifact_manifests(
    project_id,object_artifact_id,artifact_kind,artifact_role,agent_definition_id,skill_key,candidate_id,
    dataset_manifest_id,case_key,dataset_version_id,
    provider_key,bucket,object_key,content_type,size_bytes,sha256,
    serialization_version,runtime_version,definition_hash,tool_contract_set_hash,
    source_ref,created_by
  ) values (
    p_project_id,p_object_artifact_id,p_artifact_kind,p_artifact_role,p_agent_definition_id,nullif(btrim(coalesce(p_skill_key,'')),''),p_candidate_id,
    p_dataset_manifest_id,p_case_key,p_dataset_version_id,
    btrim(p_provider_key),btrim(p_bucket),btrim(p_object_key),btrim(p_content_type),
    p_size_bytes,p_sha256,btrim(p_serialization_version),
    nullif(btrim(coalesce(p_runtime_version,'')),''),
    p_definition_hash,p_tool_contract_set_hash,btrim(p_source_ref),p_created_by
  )
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function agent.register_learning_artifact_manifest(
  uuid,uuid,text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,text,text,text,text,text,text,uuid
) from public,anon,authenticated;
grant execute on function agent.register_learning_artifact_manifest(
  uuid,uuid,text,text,uuid,text,uuid,uuid,text,text,text,text,text,text,bigint,text,text,text,text,text,text,uuid
) to service_role;

create or replace function agent.register_learning_runtime_binding(
  p_project_id uuid,
  p_policy_id uuid,
  p_candidate_id uuid,
  p_baseline_agent_definition_id uuid,
  p_candidate_agent_definition_id uuid,
  p_rollback_agent_definition_id uuid,
  p_baseline_artifact_id uuid,
  p_candidate_artifact_id uuid,
  p_baseline_runtime_hash text,
  p_candidate_runtime_hash text,
  p_binding_hash text
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,agent
as $$
declare
  v_policy agent.learning_evaluation_policies%rowtype;
  v_candidate agent.learning_candidates%rowtype;
  v_base record;
  v_cand record;
  v_rollback record;
  v_base_art agent.learning_artifact_manifests%rowtype;
  v_cand_art agent.learning_artifact_manifests%rowtype;
  v_expected text;
  v_id uuid;
begin
  select * into v_policy
  from agent.learning_evaluation_policies
  where id=p_policy_id and project_id=p_project_id and candidate_id=p_candidate_id;
  if not found then raise exception 'Locked policy not found for runtime binding'; end if;

  select * into v_candidate
  from agent.learning_candidates
  where id=p_candidate_id and project_id=p_project_id;
  if not found then raise exception 'Learning candidate not found for runtime binding'; end if;

  select d.id,d.agent_key,d.version,l.lifecycle_state into v_base
  from agent.agent_definitions d
  join agent.agent_version_lifecycle l on l.agent_definition_id=d.id
  where d.id=p_baseline_agent_definition_id;

  select d.id,d.agent_key,d.version,l.lifecycle_state into v_cand
  from agent.agent_definitions d
  join agent.agent_version_lifecycle l on l.agent_definition_id=d.id
  where d.id=p_candidate_agent_definition_id;

  select d.id,d.agent_key,d.version,l.lifecycle_state into v_rollback
  from agent.agent_definitions d
  join agent.agent_version_lifecycle l on l.agent_definition_id=d.id
  where d.id=p_rollback_agent_definition_id;

  if v_base.id is null or v_cand.id is null or v_rollback.id is null then
    raise exception 'Runtime definition binding is incomplete';
  end if;
  if v_base.agent_key<>v_policy.agent_key
    or v_cand.agent_key<>v_policy.agent_key
    or v_rollback.agent_key<>v_policy.agent_key
  then
    raise exception 'Runtime definitions do not match policy agent';
  end if;
  if v_base.version<>v_policy.baseline_version or v_cand.version<>v_policy.candidate_version then
    raise exception 'Runtime definitions do not match locked policy versions';
  end if;
  if v_candidate.baseline_version<>v_base.version or v_candidate.candidate_version<>v_cand.version then
    raise exception 'Candidate baseline/candidate runtime version mismatch';
  end if;
  if v_base.lifecycle_state not in ('ACTIVE','DEPRECATED')
    or v_cand.lifecycle_state not in ('VALIDATED','CANDIDATE')
  then
    raise exception 'Runtime lifecycle is not eligible for evaluation';
  end if;
  if v_rollback.lifecycle_state not in ('ACTIVE','DEPRECATED') then
    raise exception 'Rollback runtime is not recoverable';
  end if;
  if v_policy.rollback_ref<>('agent-definition:'||p_rollback_agent_definition_id::text) then
    raise exception 'Rollback runtime does not match locked policy rollback reference';
  end if;

  select * into v_base_art
  from agent.learning_artifact_manifests
  where id=p_baseline_artifact_id and project_id=p_project_id;

  select * into v_cand_art
  from agent.learning_artifact_manifests
  where id=p_candidate_artifact_id and project_id=p_project_id;

  if v_base_art.agent_definition_id<>p_baseline_agent_definition_id
    or v_base_art.skill_key<>v_policy.skill_key
    or v_base_art.artifact_role<>'BASELINE'
  then
    raise exception 'Baseline executable artifact binding mismatch';
  end if;
  if v_cand_art.agent_definition_id<>p_candidate_agent_definition_id
    or v_cand_art.skill_key<>v_policy.skill_key
    or v_cand_art.candidate_id<>p_candidate_id
    or v_cand_art.artifact_role<>'CANDIDATE'
  then
    raise exception 'Candidate executable artifact binding mismatch';
  end if;
  if p_baseline_runtime_hash<>v_base_art.sha256 or p_candidate_runtime_hash<>v_cand_art.sha256 then
    raise exception 'Runtime hashes must equal immutable executable artifact digests';
  end if;
  if v_base_art.runtime_version<>v_cand_art.runtime_version then
    raise exception 'Baseline and candidate must use the same runtime version';
  end if;
  if v_base_art.tool_contract_set_hash<>v_cand_art.tool_contract_set_hash then
    raise exception 'Baseline and candidate tool contracts must be identical';
  end if;

  v_expected := 'sha256:'||encode(
    extensions.digest(
      concat_ws('|',
        p_project_id::text,p_policy_id::text,p_candidate_id::text,
        p_baseline_agent_definition_id::text,p_candidate_agent_definition_id::text,
        p_rollback_agent_definition_id::text,p_baseline_artifact_id::text,
        p_candidate_artifact_id::text,p_baseline_runtime_hash,p_candidate_runtime_hash
      ),
      'sha256'
    ),
    'hex'
  );
  if p_binding_hash<>v_expected then raise exception 'Runtime binding hash mismatch'; end if;

  insert into agent.learning_evaluation_runtime_bindings(
    project_id,policy_id,candidate_id,
    baseline_agent_definition_id,candidate_agent_definition_id,rollback_agent_definition_id,
    baseline_artifact_id,candidate_artifact_id,
    baseline_runtime_hash,candidate_runtime_hash,binding_hash
  ) values (
    p_project_id,p_policy_id,p_candidate_id,
    p_baseline_agent_definition_id,p_candidate_agent_definition_id,p_rollback_agent_definition_id,
    p_baseline_artifact_id,p_candidate_artifact_id,
    p_baseline_runtime_hash,p_candidate_runtime_hash,p_binding_hash
  )
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function agent.register_learning_runtime_binding(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text
) from public,anon,authenticated;
grant execute on function agent.register_learning_runtime_binding(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text
) to service_role;

create or replace function agent.register_learning_evaluator_assignment(
  p_project_id uuid,
  p_policy_id uuid,
  p_candidate_id uuid,
  p_proposer_user_id uuid,
  p_evaluator_user_id uuid,
  p_assigned_by uuid,
  p_scope_hash text,
  p_acknowledged_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,agent
as $$
declare
  v_policy agent.learning_evaluation_policies%rowtype;
  v_expected text;
  v_id uuid;
begin
  select * into v_policy
  from agent.learning_evaluation_policies
  where id=p_policy_id and project_id=p_project_id and candidate_id=p_candidate_id;
  if not found then raise exception 'Locked policy not found for evaluator assignment'; end if;

  if p_proposer_user_id is null
    or p_evaluator_user_id is null
    or p_assigned_by is null
    or p_acknowledged_at is null
  then
    raise exception 'Canonical evaluator identities and acknowledgement are required';
  end if;
  if p_proposer_user_id=p_evaluator_user_id or p_assigned_by=p_evaluator_user_id then
    raise exception 'Independent evaluator separation is required';
  end if;
  if v_policy.proposer_actor_id<>p_proposer_user_id::text
    or v_policy.evaluator_actor_id<>p_evaluator_user_id::text
  then
    raise exception 'Evaluator assignment does not match locked policy actor identities';
  end if;
  if p_acknowledged_at < v_policy.locked_at then
    raise exception 'Evaluator acknowledgement predates locked policy';
  end if;

  v_expected := 'sha256:'||encode(
    extensions.digest(
      concat_ws('|',
        p_project_id::text,p_policy_id::text,p_candidate_id::text,
        p_proposer_user_id::text,p_evaluator_user_id::text,
        v_policy.manifest_hash,v_policy.rubric_ref,v_policy.calibration_ref
      ),
      'sha256'
    ),
    'hex'
  );
  if p_scope_hash<>v_expected then raise exception 'Evaluator assignment scope hash mismatch'; end if;

  insert into agent.learning_evaluator_assignments(
    project_id,policy_id,candidate_id,
    proposer_user_id,evaluator_user_id,assigned_by,scope_hash,acknowledged_at
  ) values (
    p_project_id,p_policy_id,p_candidate_id,
    p_proposer_user_id,p_evaluator_user_id,p_assigned_by,p_scope_hash,p_acknowledged_at
  )
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function agent.register_learning_evaluator_assignment(
  uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz
) from public,anon,authenticated;
grant execute on function agent.register_learning_evaluator_assignment(
  uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz
) to service_role;

comment on table agent.learning_artifact_manifests is
  'Append-only exact-byte manifests for governed learning executable artifacts and held-out replay inputs.';
comment on table agent.learning_evaluation_runtime_bindings is
  'Immutable binding from locked evaluation policy arms to exact executable agent definitions/artifacts/runtime hashes and rollback identity.';
comment on table agent.learning_evaluator_assignments is
  'Immutable canonical proposer/evaluator identity and independent-review attestation for a locked learning policy.';
