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

create index if not exists agent_run_logs_run_created_idx
  on agent.agent_run_logs (agent_run_id, created_at desc);

create index if not exists agent_run_logs_step_created_idx
  on agent.agent_run_logs (agent_run_step_id, created_at desc)
  where agent_run_step_id is not null;

alter table agent.agent_run_logs enable row level security;

revoke all on agent.agent_run_logs from anon;
revoke all on agent.agent_run_logs from authenticated;

grant all on table agent.agent_run_logs to service_role;

comment on table agent.agent_run_logs is 'Append-only operational logs for persisted agent runs. Server-side executor writes use the service role; authenticated reads are scoped to project membership through agent.agent_runs.';
