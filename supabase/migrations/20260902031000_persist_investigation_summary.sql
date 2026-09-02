-- Persist the dedicated profiling investigation step into the profile-run summary.
-- This preserves the workspace read model while keeping investigation execution
-- separate from deterministic metric execution.

create or replace function profiling.persist_investigation_summary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, profiling, agent
as $$
declare
  investigation jsonb;
begin
  investigation := case
    when jsonb_typeof(new.output) = 'object' then new.output -> 'investigation'
    else null
  end;

  if investigation is not null
     and jsonb_typeof(investigation) = 'object'
     and new.dataset_version_id is not null then
    update profiling.profile_runs
       set summary = coalesce(summary, '{}'::jsonb)
                    || jsonb_build_object('investigation', investigation)
     where agent_run_id = new.id
       and dataset_version_id = new.dataset_version_id
       and status <> 'CANCELLED';
  end if;

  return new;
end;
$$;

revoke execute on function profiling.persist_investigation_summary() from public;
revoke execute on function profiling.persist_investigation_summary() from anon;
revoke execute on function profiling.persist_investigation_summary() from authenticated;

drop trigger if exists trg_persist_investigation_summary on agent.agent_runs;

create trigger trg_persist_investigation_summary
after update of output on agent.agent_runs
for each row
when (new.output is distinct from old.output)
execute function profiling.persist_investigation_summary();

-- Backfill investigation output already produced by the dedicated agent step.
update profiling.profile_runs pr
   set summary = coalesce(pr.summary, '{}'::jsonb)
                || jsonb_build_object('investigation', ar.output -> 'investigation')
  from agent.agent_runs ar
 where ar.id = pr.agent_run_id
   and ar.output is not null
   and jsonb_typeof(ar.output) = 'object'
   and ar.output ? 'investigation'
   and jsonb_typeof(ar.output -> 'investigation') = 'object'
   and pr.status <> 'CANCELLED';
