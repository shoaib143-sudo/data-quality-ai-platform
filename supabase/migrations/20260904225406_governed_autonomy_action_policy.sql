create table if not exists governance.autonomy_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  action_key text not null,
  enabled boolean not null default true,
  execution_mode text not null,
  min_confidence numeric not null default 0.8,
  max_auto_risk_level text not null default 'MEDIUM',
  reversible boolean not null default false,
  rollback_strategy text,
  allowed_target_types text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint autonomy_policies_execution_mode_check check (execution_mode = any(array['AUTO','APPROVAL_REQUIRED','BLOCKED'])),
  constraint autonomy_policies_confidence_check check (min_confidence >= 0 and min_confidence <= 1),
  constraint autonomy_policies_risk_check check (max_auto_risk_level = any(array['INFO','LOW','MEDIUM','HIGH','CRITICAL'])),
  constraint autonomy_policies_project_action_uq unique(project_id,action_key)
);

create table if not exists governance.autonomy_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  policy_id uuid not null references governance.autonomy_policies(id) on delete restrict,
  source_agent_run_id uuid references agent.agent_runs(id) on delete set null,
  action_key text not null,
  target_type text not null,
  target_id uuid,
  risk_level text not null default 'MEDIUM',
  confidence numeric not null,
  status text not null default 'PROPOSED',
  idempotency_key text not null,
  requested_by uuid references auth.users(id) on delete set null,
  approval_workflow_instance_id uuid references governance.workflow_instances(id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  before_state jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  rollback jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  rolled_back_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint autonomy_actions_risk_check check (risk_level = any(array['INFO','LOW','MEDIUM','HIGH','CRITICAL'])),
  constraint autonomy_actions_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint autonomy_actions_status_check check (status = any(array['PROPOSED','AWAITING_APPROVAL','APPROVED','EXECUTING','EXECUTED','REJECTED','BLOCKED','FAILED','ROLLED_BACK'])),
  constraint autonomy_actions_project_idempotency_uq unique(project_id,idempotency_key)
);

create index if not exists autonomy_policies_project_idx on governance.autonomy_policies(project_id,enabled,execution_mode);
create index if not exists autonomy_actions_project_status_idx on governance.autonomy_actions(project_id,status,created_at desc);
create index if not exists autonomy_actions_target_idx on governance.autonomy_actions(project_id,target_type,target_id,created_at desc);

alter table governance.autonomy_policies enable row level security;
alter table governance.autonomy_actions enable row level security;
revoke all on governance.autonomy_policies from public,anon,authenticated;
revoke all on governance.autonomy_actions from public,anon,authenticated;
grant all on governance.autonomy_policies to service_role;
grant all on governance.autonomy_actions to service_role;

create or replace function governance.seed_default_autonomy_policies(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance
as $$
declare
  v_count integer := 0;
begin
  insert into governance.autonomy_policies(project_id,action_key,enabled,execution_mode,min_confidence,max_auto_risk_level,reversible,rollback_strategy,allowed_target_types,metadata,updated_at)
  values
    (p_project_id,'CREATE_GOVERNANCE_ISSUE',true,'AUTO',0.80,'CRITICAL',true,'CLOSE_CREATED_ISSUE',array['DATASET','PROJECT'],jsonb_build_object('blast_radius','GOVERNANCE_METADATA_ONLY','production_source_mutation',false),now()),
    (p_project_id,'REQUEST_REPROFILE',true,'APPROVAL_REQUIRED',0.85,'HIGH',false,null,array['DATASET_VERSION'],jsonb_build_object('reason','COMPUTE_AND_SOURCE_READ_SIDE_EFFECT','production_source_mutation',false),now()),
    (p_project_id,'UPDATE_QUALITY_RULE_THRESHOLD',false,'BLOCKED',1.0,'INFO',false,null,array['QUALITY_RULE'],jsonb_build_object('blocked_reason','THRESHOLD_CHANGES_REQUIRE_EXPLICIT_HUMAN_GOVERNANCE'),now()),
    (p_project_id,'MUTATE_SOURCE_DATA',false,'BLOCKED',1.0,'INFO',false,null,array['DATASET'],jsonb_build_object('blocked_reason','SOURCE_DATA_MUTATION_NOT_ALLOWED_FOR_AUTONOMOUS_AGENTS'),now()),
    (p_project_id,'ALTER_SCHEMA',false,'BLOCKED',1.0,'INFO',false,null,array['DATASET'],jsonb_build_object('blocked_reason','SCHEMA_MUTATION_NOT_ALLOWED_FOR_AUTONOMOUS_AGENTS'),now()),
    (p_project_id,'DELETE_DATA',false,'BLOCKED',1.0,'INFO',false,null,array['DATASET'],jsonb_build_object('blocked_reason','DESTRUCTIVE_DATA_ACTION_NOT_ALLOWED_FOR_AUTONOMOUS_AGENTS'),now())
  on conflict(project_id,action_key) do update set
    enabled=excluded.enabled,
    execution_mode=excluded.execution_mode,
    min_confidence=excluded.min_confidence,
    max_auto_risk_level=excluded.max_auto_risk_level,
    reversible=excluded.reversible,
    rollback_strategy=excluded.rollback_strategy,
    allowed_target_types=excluded.allowed_target_types,
    metadata=excluded.metadata,
    updated_at=excluded.updated_at;
  get diagnostics v_count = row_count;
  return jsonb_build_object('project_id',p_project_id,'policies_seeded',v_count);
end;
$$;

create or replace function governance.seed_all_default_autonomy_policies()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, app
as $$
declare
  p record;
  v_projects integer := 0;
begin
  for p in select id from app.projects loop
    perform governance.seed_default_autonomy_policies(p.id);
    v_projects := v_projects + 1;
  end loop;
  return jsonb_build_object('projects_seeded',v_projects);
end;
$$;

revoke all on function governance.seed_default_autonomy_policies(uuid) from public,anon,authenticated;
revoke all on function governance.seed_all_default_autonomy_policies() from public,anon,authenticated;
grant execute on function governance.seed_default_autonomy_policies(uuid) to service_role;
grant execute on function governance.seed_all_default_autonomy_policies() to service_role;

select governance.seed_all_default_autonomy_policies();
