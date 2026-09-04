create table if not exists agent.agent_memories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  agent_definition_id uuid not null references agent.agent_definitions(id) on delete cascade,
  source_agent_run_id uuid null references agent.agent_runs(id) on delete set null,
  memory_key text not null,
  memory_type text not null check (memory_type in ('OBSERVATION','SUMMARY','DECISION','EVIDENCE','PREFERENCE')),
  content jsonb not null default '{}'::jsonb,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  content_hash text null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUPERSEDED','EXPIRED','REVOKED')),
  promoted_at timestamptz not null default now(),
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_agent_memories_active_key on agent.agent_memories(project_id,agent_definition_id,memory_key) where status='ACTIVE';
create index if not exists idx_agent_memories_project_status on agent.agent_memories(project_id,status,updated_at desc);
create index if not exists idx_agent_memories_expiry on agent.agent_memories(expires_at) where status='ACTIVE' and expires_at is not null;

create table if not exists agent.agent_evaluations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  agent_run_id uuid not null references agent.agent_runs(id) on delete cascade,
  evaluator_type text not null,
  evaluator_version text not null default '1.0',
  score numeric null check (score is null or (score >= 0 and score <= 1)),
  dimensions jsonb not null default '{}'::jsonb,
  feedback jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(agent_run_id,evaluator_type,evaluator_version)
);
create index if not exists idx_agent_evaluations_project_created on agent.agent_evaluations(project_id,created_at desc);
create index if not exists idx_agent_evaluations_run on agent.agent_evaluations(agent_run_id);

alter table agent.agent_memories enable row level security;
alter table agent.agent_evaluations enable row level security;
drop policy if exists agent_memory_select on agent.agent_memories;
create policy agent_memory_select on agent.agent_memories for select to authenticated using ((select app_private.is_project_member(project_id)));
drop policy if exists agent_evaluation_select on agent.agent_evaluations;
create policy agent_evaluation_select on agent.agent_evaluations for select to authenticated using ((select app_private.is_project_member(project_id)));
revoke all on agent.agent_memories from public,anon,authenticated;
revoke all on agent.agent_evaluations from public,anon,authenticated;
grant select on agent.agent_memories to authenticated;
grant select on agent.agent_evaluations to authenticated;
grant all on agent.agent_memories to service_role;
grant all on agent.agent_evaluations to service_role;

create or replace function orchestration.project_agent_memory_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row agent.agent_memories%rowtype;
  v_org_id uuid;
  v_actor_id text;
  v_operation text;
  v_event_type text;
  v_payload jsonb;
begin
  v_row := case when tg_op='DELETE' then old else new end;
  select organization_id into v_org_id from app.projects where id=v_row.project_id;
  if v_org_id is null then return case when tg_op='DELETE' then old else new end; end if;
  v_actor_id := auth.uid()::text;
  v_operation := case when tg_op='DELETE' or v_row.status <> 'ACTIVE' then 'DELETE' else 'UPSERT' end;
  v_event_type := case when tg_op='INSERT' then 'AGENT.MEMORY_CREATED' when tg_op='DELETE' then 'AGENT.MEMORY_DELETED' else 'AGENT.MEMORY_UPDATED' end;
  if v_operation='DELETE' then
    v_payload := jsonb_build_object('memoryType',v_row.memory_type,'memoryKey',v_row.memory_key,'status',v_row.status,'knowledgeDocument',jsonb_build_object('objectType','AGENT_MEMORY','objectId',v_row.id::text));
  else
    v_payload := jsonb_build_object(
      'agentDefinitionId',v_row.agent_definition_id,'sourceAgentRunId',v_row.source_agent_run_id,
      'memoryType',v_row.memory_type,'memoryKey',v_row.memory_key,'status',v_row.status,'confidence',v_row.confidence,'expiresAt',v_row.expires_at,
      'knowledgeDocument',jsonb_build_object(
        'objectType','AGENT_MEMORY','objectId',v_row.id::text,'label',v_row.memory_key,'description',v_row.memory_type,
        'content',left(v_row.content::text,12000),'href','/agents/memory/'||v_row.id::text,
        'metadata',jsonb_build_object('agentDefinitionId',v_row.agent_definition_id,'sourceAgentRunId',v_row.source_agent_run_id,'memoryType',v_row.memory_type,'confidence',v_row.confidence,'expiresAt',v_row.expires_at),
        'updatedAt',v_row.updated_at));
  end if;
  insert into orchestration.projection_outbox(event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,payload)
  values(gen_random_uuid(),v_row.project_id,v_org_id,1,v_operation,v_event_type,coalesce(v_row.updated_at,now()),'AGENT_MEMORY',v_row.id::text,case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,v_payload);
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function orchestration.project_agent_memory_change() from public,anon,authenticated;
drop trigger if exists agent_memories_projection_outbox on agent.agent_memories;
create trigger agent_memories_projection_outbox after insert or delete or update of content,confidence,status,expires_at on agent.agent_memories for each row execute function orchestration.project_agent_memory_change();

create or replace function orchestration.project_agent_evaluation_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org_id uuid;
  v_actor_id text;
begin
  select organization_id into v_org_id from app.projects where id=new.project_id;
  if v_org_id is null then return new; end if;
  v_actor_id := auth.uid()::text;
  insert into orchestration.projection_outbox(event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,aggregate_type,aggregate_id,actor_type,actor_id,payload)
  values(gen_random_uuid(),new.project_id,v_org_id,1,'APPEND','AGENT.EVALUATION_CREATED',new.created_at,'AGENT_EVALUATION',new.id::text,case when v_actor_id is null then 'SYSTEM' else 'USER' end,v_actor_id,
    jsonb_build_object('agentRunId',new.agent_run_id,'evaluatorType',new.evaluator_type,'evaluatorVersion',new.evaluator_version,'score',new.score,'dimensions',new.dimensions));
  return new;
end;
$$;
revoke all on function orchestration.project_agent_evaluation_change() from public,anon,authenticated;
drop trigger if exists agent_evaluations_projection_outbox on agent.agent_evaluations;
create trigger agent_evaluations_projection_outbox after insert on agent.agent_evaluations for each row execute function orchestration.project_agent_evaluation_change();
