-- Keep the initial Cloudflare OBSERVABILITY canary single-flight.
-- Idempotent replay by the same worker is allowed, but a second worker cannot
-- claim another canary-tagged OBSERVABILITY job while a live canary lease exists.

create or replace function orchestration.claim_jobs_by_type(
  p_worker text,
  p_job_type text,
  p_limit integer default 1
)
returns setof orchestration.job_queue
language plpgsql
security definer
set search_path to 'pg_catalog', 'orchestration'
as $function$
declare
  v_candidate orchestration.job_queue%rowtype;
  v_claimed orchestration.job_queue%rowtype;
  v_count integer := 0;
  v_running integer;
  v_max integer;
  v_limit integer := greatest(1, least(coalesce(p_limit, 1), 4));
  v_type text := upper(coalesce(nullif(trim(p_job_type), ''), ''));
begin
  if v_type <> 'OBSERVABILITY' then
    raise exception 'Unsupported Cloudflare canary job type: %', coalesce(p_job_type, '<null>')
      using errcode = '22023';
  end if;

  -- Idempotent transport replay remains first. The same worker can recover its
  -- already-acquired live lease without incrementing attempts or claiming more.
  return query
  select q.*
    from orchestration.job_queue q
   where q.status = 'RUNNING'
     and q.lease_owner = p_worker
     and q.lease_expires_at > now()
     and q.job_type = v_type
     and coalesce(q.payload->>'executionLane', '') = 'CLOUDFLARE_CANARY'
   order by q.priority asc, q.created_at asc
   limit v_limit;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    return;
  end if;
  v_count := 0;

  -- Initial canary rollout is globally single-flight. A different worker must
  -- leave queued canary work untouched until the active lease ends or expires.
  if exists (
    select 1
      from orchestration.job_queue q
     where q.status = 'RUNNING'
       and q.job_type = v_type
       and q.lease_expires_at > now()
       and coalesce(q.payload->>'executionLane', '') = 'CLOUDFLARE_CANARY'
  ) then
    return;
  end if;

  for v_candidate in
    select q.*
      from orchestration.job_queue q
     where q.status = 'QUEUED'
       and q.job_type = v_type
       and coalesce(q.payload->>'executionLane', '') = 'CLOUDFLARE_CANARY'
       and q.available_at <= now()
       and (q.lease_expires_at is null or q.lease_expires_at < now())
       and q.attempts < q.max_attempts
       and not exists (
         select 1
           from orchestration.job_dependencies d
           join orchestration.job_queue parent on parent.id = d.depends_on_job_id
          where d.job_id = q.id
            and (
              (d.dependency_type = 'SUCCESS' and parent.status <> 'SUCCEEDED')
              or (d.dependency_type = 'TERMINAL' and parent.status not in ('SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'))
            )
       )
     order by q.priority asc, q.created_at asc
     limit least(64, v_limit * 16)
     for update of q skip locked
  loop
    select coalesce(cp.max_concurrent_jobs, 4)
      into v_max
      from (select v_candidate.project_id as project_id) p
      left join orchestration.capacity_policies cp on cp.project_id = p.project_id;

    select count(*)
      into v_running
      from orchestration.job_queue q
     where q.project_id = v_candidate.project_id
       and q.status = 'RUNNING';

    if v_running >= v_max then
      continue;
    end if;

    update orchestration.job_queue q
       set status = 'RUNNING',
           lease_owner = p_worker,
           lease_expires_at = now() + interval '10 minutes',
           attempts = q.attempts + 1,
           started_at = coalesce(q.started_at, now()),
           updated_at = now()
     where q.id = v_candidate.id
       and q.status = 'QUEUED'
       and q.job_type = v_type
       and coalesce(q.payload->>'executionLane', '') = 'CLOUDFLARE_CANARY'
    returning q.* into v_claimed;

    if found then
      return next v_claimed;
      return;
    end if;
  end loop;

  return;
end;
$function$;

revoke execute on function orchestration.claim_jobs_by_type(text,text,integer) from public,anon,authenticated;
grant execute on function orchestration.claim_jobs_by_type(text,text,integer) to service_role;

select pg_notify('pgrst','reload schema');
