begin;

-- Agent run logs are operationally useful on the persisted run detail page, but
-- must remain project-scoped. The policy derives project ownership from the
-- parent agent run and reuses the existing membership helper.
drop policy if exists agent_run_logs_select
on agent.agent_run_logs;

create policy agent_run_logs_select
on agent.agent_run_logs
for select
to authenticated
using (
  exists (
    select 1
    from agent.agent_runs r
    where r.id = agent_run_logs.agent_run_id
      and app_private.is_project_member(r.project_id)
  )
);

grant select on table agent.agent_run_logs to authenticated;

comment on table agent.agent_run_logs is 'Operational logs for persisted agent runs. Server-side executor writes use service role; authenticated reads are scoped to project membership through agent.agent_runs.';

commit;
