alter table agent.agent_memories drop constraint if exists agent_memories_memory_type_check;
alter table agent.agent_memories add constraint agent_memories_memory_type_check
check (memory_type = any (array['OBSERVATION','SUMMARY','DECISION','EVIDENCE','PREFERENCE','EPISODE','SEMANTIC']::text[]));

create table if not exists agent.agent_working_memory (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  agent_run_id uuid not null references agent.agent_runs(id) on delete cascade,
  memory_key text not null,
  content jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agent_run_id,memory_key),
  check (length(trim(memory_key)) > 0),
  check (expires_at > created_at)
);
create index if not exists agent_working_memory_project_expiry_idx on agent.agent_working_memory(project_id,expires_at);
alter table agent.agent_working_memory enable row level security;
drop policy if exists agent_working_memory_project_read on agent.agent_working_memory;
create policy agent_working_memory_project_read on agent.agent_working_memory for select to authenticated using (app_private.is_project_member(project_id));
revoke all on agent.agent_working_memory from public,anon,authenticated;
grant select on agent.agent_working_memory to authenticated;
grant all on agent.agent_working_memory to service_role;

create table if not exists agent.agent_memory_relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  memory_id uuid not null references agent.agent_memories(id) on delete cascade,
  relationship_type text not null,
  target_type text not null,
  target_key text not null,
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(memory_id,relationship_type,target_type,target_key),
  check (length(trim(relationship_type)) > 0),
  check (length(trim(target_type)) > 0),
  check (length(trim(target_key)) > 0)
);
create index if not exists agent_memory_relationships_project_target_idx on agent.agent_memory_relationships(project_id,target_type,target_key);
alter table agent.agent_memory_relationships enable row level security;
drop policy if exists agent_memory_relationships_project_read on agent.agent_memory_relationships;
create policy agent_memory_relationships_project_read on agent.agent_memory_relationships for select to authenticated using (app_private.is_project_member(project_id));
revoke all on agent.agent_memory_relationships from public,anon,authenticated;
grant select on agent.agent_memory_relationships to authenticated;
grant all on agent.agent_memory_relationships to service_role;

create table if not exists agent.agent_learning_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  agent_definition_id uuid null references agent.agent_definitions(id) on delete set null,
  source_agent_run_id uuid null references agent.agent_runs(id) on delete set null,
  case_key text not null,
  source_kind text not null,
  problem_type text not null,
  context jsonb not null default '{}'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  decision_status text null,
  outcome_status text null,
  effectiveness numeric null check (effectiveness is null or (effectiveness >= 0 and effectiveness <= 1)),
  confidence numeric null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUPERSEDED','REVOKED')),
  occurred_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,case_key),
  check (length(trim(case_key)) > 0),
  check (length(trim(source_kind)) > 0),
  check (length(trim(problem_type)) > 0)
);
create index if not exists agent_learning_cases_project_problem_idx on agent.agent_learning_cases(project_id,problem_type,status,updated_at desc);
alter table agent.agent_learning_cases enable row level security;
drop policy if exists agent_learning_cases_project_read on agent.agent_learning_cases;
create policy agent_learning_cases_project_read on agent.agent_learning_cases for select to authenticated using (app_private.is_project_member(project_id));
revoke all on agent.agent_learning_cases from public,anon,authenticated;
grant select on agent.agent_learning_cases to authenticated;
grant all on agent.agent_learning_cases to service_role;

create or replace function agent.expire_working_memory()
returns integer language plpgsql security definer set search_path = agent, public as $$
declare v_deleted integer;
begin
  delete from agent.agent_working_memory where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function agent.expire_working_memory() from public,anon,authenticated;
grant execute on function agent.expire_working_memory() to service_role;

create or replace function agent.search_learning_cases(p_project_id uuid,p_query text,p_limit integer default 10)
returns table(id uuid,case_key text,source_kind text,problem_type text,recommendation jsonb,outcome_status text,effectiveness numeric,confidence numeric,evidence jsonb,relevance numeric)
language sql stable security invoker set search_path = agent, public as $$
  with q as (select lower(trim(coalesce(p_query,''))) value)
  select lc.id,lc.case_key,lc.source_kind,lc.problem_type,lc.recommendation,lc.outcome_status,lc.effectiveness,lc.confidence,lc.evidence,
         (case when lower(lc.problem_type)=q.value then 1.0 else 0 end +
          case when lower(lc.problem_type) like '%'||q.value||'%' then 0.7 else 0 end +
          case when lower(lc.context::text) like '%'||q.value||'%' then 0.4 else 0 end +
          case when lower(lc.recommendation::text) like '%'||q.value||'%' then 0.35 else 0 end +
          case when lower(lc.evidence::text) like '%'||q.value||'%' then 0.2 else 0 end)::numeric relevance
  from agent.agent_learning_cases lc cross join q
  where lc.project_id=p_project_id and lc.status='ACTIVE' and q.value<>'' and (
    lower(lc.problem_type) like '%'||q.value||'%' or lower(lc.context::text) like '%'||q.value||'%' or
    lower(lc.recommendation::text) like '%'||q.value||'%' or lower(lc.evidence::text) like '%'||q.value||'%')
  order by relevance desc,coalesce(lc.effectiveness,-1) desc,lc.updated_at desc
  limit greatest(1,least(coalesce(p_limit,10),50));
$$;
grant execute on function agent.search_learning_cases(uuid,text,integer) to authenticated,service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='dgp-agent-working-memory-expiry';
    perform cron.schedule('dgp-agent-working-memory-expiry','17 * * * *',$job$select agent.expire_working_memory();$job$);
  end if;
exception when others then raise warning 'Unable to schedule working-memory expiry: %',sqlerrm;
end;
$$;