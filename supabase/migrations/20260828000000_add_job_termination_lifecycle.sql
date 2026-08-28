alter table agent.agent_runs
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text;

create index if not exists agent_runs_cancelled_by_idx on agent.agent_runs(cancelled_by);
create index if not exists agent_runs_cancel_requested_at_idx on agent.agent_runs(cancel_requested_at);

create or replace function agent.prevent_terminated_run_reactivation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, agent, profiling
as $$
begin
  if tg_table_schema = 'agent' and tg_table_name = 'agent_runs' then
    if old.status = 'CANCELLED' and old.error_code = 'TERMINATED_BY_USER' then
      return old;
    end if;
  elsif tg_table_schema = 'agent' and tg_table_name = 'agent_run_steps' then
    if old.status = 'SKIPPED' and old.error_code = 'TERMINATED_BY_USER' then
      return old;
    end if;
  elsif tg_table_schema = 'profiling' and tg_table_name = 'profile_runs' then
    if old.status = 'CANCELLED' and old.error_code = 'TERMINATED_BY_USER' then
      return old;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_terminated_agent_run_reactivation on agent.agent_runs;
create trigger prevent_terminated_agent_run_reactivation
before update on agent.agent_runs
for each row execute function agent.prevent_terminated_run_reactivation();

drop trigger if exists prevent_terminated_agent_step_reactivation on agent.agent_run_steps;
create trigger prevent_terminated_agent_step_reactivation
before update on agent.agent_run_steps
for each row execute function agent.prevent_terminated_run_reactivation();

drop trigger if exists prevent_terminated_profile_run_reactivation on profiling.profile_runs;
create trigger prevent_terminated_profile_run_reactivation
before update on profiling.profile_runs
for each row execute function agent.prevent_terminated_run_reactivation();
