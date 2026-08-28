begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists agent.agent_run_logs (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent.agent_runs(id) on delete cascade,
  agent_run_step_id uuid references agent.agent_run_steps(id) on delete set null,
  level text not null check (level in ('DEBUG','INFO','WARN','ERROR','LIFECYCLE','TOOL','METRIC','DATABASE')),
  event_type text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_run_logs_run_created
  on agent.agent_run_logs(agent_run_id, created_at desc);
create index if not exists idx_agent_run_logs_level
  on agent.agent_run_logs(agent_run_id, level, created_at desc);

alter table agent.agent_run_logs enable row level security;

drop policy if exists agent_run_logs_select_member on agent.agent_run_logs;
create policy agent_run_logs_select_member
on agent.agent_run_logs
for select
to authenticated
using (
  exists (
    select 1
    from agent.agent_runs r
    join catalog.project_members pm on pm.project_id = r.project_id
    where r.id = agent_run_logs.agent_run_id
      and pm.user_id = auth.uid()
  )
);

grant select on agent.agent_run_logs to authenticated;
grant all on agent.agent_run_logs to service_role;

commit;
