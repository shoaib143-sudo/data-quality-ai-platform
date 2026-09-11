-- Extend canonical agent-run result artifacts to profiling executions.
-- Only genuine successful profiling-agent runs with persisted output are backfilled.
-- Historical completed-profile / failed-agent inconsistencies without canonical
-- agent output are intentionally not rewritten or fabricated.

create or replace function agent.enforce_profiling_success_output()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status = 'SUCCEEDED'
     and new.output is null
     and exists (
       select 1
         from agent.agent_definitions d
        where d.id = new.agent_definition_id
          and d.agent_key = 'profiling_agent'
     ) then
    raise exception 'profiling agent run % cannot be marked SUCCEEDED without canonical output', new.id;
  end if;

  return new;
end;
$function$;

comment on function agent.enforce_profiling_success_output() is
  'Prevents profiling-agent runs from being promoted to SUCCEEDED without genuine canonical output.';

drop trigger if exists trg_enforce_profiling_success_output on agent.agent_runs;
create trigger trg_enforce_profiling_success_output
before insert or update of status, output on agent.agent_runs
for each row
execute function agent.enforce_profiling_success_output();

-- Publish canonical artifacts for already-successful profiling runs only when
-- their genuine result output is already persisted. Reuse the same governed
-- persistence function used by live execution so hashing/integrity semantics
-- remain identical and conflicting retries fail closed.
do $block$
declare
  v_run record;
begin
  for v_run in
    select r.id, r.output, r.completed_at
      from agent.agent_runs r
      join agent.agent_definitions d on d.id = r.agent_definition_id
     where d.agent_key = 'profiling_agent'
       and r.status = 'SUCCEEDED'
       and r.output is not null
  loop
    perform *
      from agent.persist_agent_run_result(
        v_run.id,
        v_run.output,
        'AGENT_RUN_RESULT',
        '1.0',
        'Profiling agent result',
        coalesce(v_run.completed_at, now())
      );
  end loop;
end;
$block$;
