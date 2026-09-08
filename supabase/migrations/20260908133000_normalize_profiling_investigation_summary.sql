-- Keep profiling.profile_runs.summary.investigation as the canonical domain result.
-- Agent/tool execution envelopes belong in agent run outputs and step outputs, not
-- in the profiling read model.

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

  -- executeProfilingExecutor returns a ToolExecutionResult envelope. Persist only
  -- its domain result so profile_runs.summary keeps one stable investigation shape.
  if jsonb_typeof(investigation) = 'object'
     and jsonb_typeof(investigation -> 'output') = 'object'
     and jsonb_typeof(investigation -> 'output' -> 'result') = 'object' then
    investigation := investigation -> 'output' -> 'result';
  end if;

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

-- Repair summaries previously overwritten by the agent/tool execution envelope.
update profiling.profile_runs
   set summary = jsonb_set(
     coalesce(summary, '{}'::jsonb),
     '{investigation}',
     summary -> 'investigation' -> 'output' -> 'result',
     true
   )
 where jsonb_typeof(summary -> 'investigation') = 'object'
   and jsonb_typeof(summary -> 'investigation' -> 'output') = 'object'
   and jsonb_typeof(summary -> 'investigation' -> 'output' -> 'result') = 'object';
