begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- profiling.run_profile(uuid) predates the application-owned deterministic
-- metric engine. Keeping the old body reachable is unsafe because it calls
-- profiling.execute_metrics(uuid), which is intentionally deprecated.
--
-- The supported profiling lifecycle is started through the governed
-- /api/agents/run boundary and its durable PROFILING job. That path performs
-- source validation, authorization, canonical metric execution, findings,
-- scoring, governance insights, and downstream orchestration.
create or replace function profiling.run_profile(p_dataset_version_id uuid)
returns uuid
language plpgsql
set search_path = pg_catalog, profiling
as $function$
begin
  raise exception using
    errcode = '0A000',
    message = 'profiling.run_profile(uuid) is deprecated; start profiling through the governed application profiling execution boundary.',
    hint = 'Use /api/agents/run (profiling_agent v2.0) or the corresponding governed application service. Do not call profiling.execute_metrics(uuid).';
end;
$function$;

revoke execute on function profiling.run_profile(uuid) from public, anon, authenticated;

comment on function profiling.run_profile(uuid) is
  'Deprecated compatibility boundary. Profiling execution is application-owned and must run through the governed durable profiling path.';

commit;
