-- Deterministic durable queue health for production readiness.
-- An idle queue is healthy. Only unresolved recent DEAD jobs or stale RUNNING
-- leases degrade the queue; inability to evaluate the RPC is handled by the caller.

create or replace function orchestration.verify_job_queue_health(p_window_minutes integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_cutoff timestamptz;
  v_now timestamptz := statement_timestamp();
  v_unresolved_dead integer;
  v_stale_running integer;
  v_recent_succeeded integer;
  v_recent_dead integer;
  v_active_running integer;
  v_idle boolean;
begin
  if p_window_minutes is null or p_window_minutes < 1 or p_window_minutes > 1440 then
    raise exception 'QUEUE_HEALTH_INVALID_WINDOW' using errcode = '22023';
  end if;

  v_cutoff := v_now - make_interval(mins => p_window_minutes);

  select count(*)::integer
  into v_recent_dead
  from orchestration.job_queue j
  where j.status = 'DEAD'
    and j.completed_at >= v_cutoff;

  select count(*)::integer
  into v_recent_succeeded
  from orchestration.job_queue j
  where j.status = 'SUCCEEDED'
    and j.completed_at >= v_cutoff;

  select count(*)::integer
  into v_unresolved_dead
  from orchestration.job_queue dead
  where dead.status = 'DEAD'
    and dead.completed_at >= v_cutoff
    and not exists (
      select 1
      from orchestration.job_queue recovered
      where recovered.status = 'SUCCEEDED'
        and recovered.project_id = dead.project_id
        and recovered.job_type = dead.job_type
        and recovered.entity_id is not distinct from dead.entity_id
        and recovered.completed_at is not null
        and dead.completed_at is not null
        and recovered.completed_at > dead.completed_at
    );

  select count(*)::integer
  into v_stale_running
  from orchestration.job_queue j
  where j.status = 'RUNNING'
    and j.lease_expires_at is not null
    and j.lease_expires_at < v_now;

  select count(*)::integer
  into v_active_running
  from orchestration.job_queue j
  where j.status = 'RUNNING'
    and (j.lease_expires_at is null or j.lease_expires_at >= v_now);

  v_idle := v_recent_dead = 0
    and v_recent_succeeded = 0
    and v_active_running = 0
    and v_stale_running = 0;

  return jsonb_build_object(
    'valid', true,
    'status', case when v_unresolved_dead > 0 or v_stale_running > 0 then 'DEGRADED' else 'READY' end,
    'idle', v_idle,
    'window_minutes', p_window_minutes,
    'recent_dead', v_recent_dead,
    'recent_succeeded', v_recent_succeeded,
    'unresolved_dead', v_unresolved_dead,
    'active_running', v_active_running,
    'stale_running', v_stale_running,
    'evaluated_at', v_now
  );
end;
$$;

revoke all on function orchestration.verify_job_queue_health(integer) from public, anon, authenticated;
grant execute on function orchestration.verify_job_queue_health(integer) to service_role;

do $$
declare
  v_result jsonb;
begin
  select orchestration.verify_job_queue_health() into v_result;
  if coalesce((v_result->>'valid')::boolean, false) is not true then
    raise exception 'JOB_QUEUE_HEALTH_PROBE_POSTCONDITION_FAILED: %', v_result;
  end if;
  if has_function_privilege('anon', 'orchestration.verify_job_queue_health(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'orchestration.verify_job_queue_health(integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'orchestration.verify_job_queue_health(integer)', 'EXECUTE') then
    raise exception 'JOB_QUEUE_HEALTH_PROBE_ACL_FAILED';
  end if;
end
$$;
