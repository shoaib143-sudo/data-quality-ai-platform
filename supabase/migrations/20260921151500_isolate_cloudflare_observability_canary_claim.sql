-- Isolate the Cloudflare OBSERVABILITY canary from the general CORE worker pool.
-- Canary-tagged jobs can only be claimed by the dedicated Cloudflare claim RPC.
-- General Vercel/Supabase worker claims explicitly skip those rows.
-- This preserves one active claim authority for the canary subset while keeping
-- the existing scheduler and all non-canary work on the established path.

create or replace function orchestration.claim_jobs_by_pool(
  p_worker text,
  p_pool text,
  p_limit integer default 2
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 2), 16));
  v_scan_limit integer := least(256, greatest(32, greatest(1, least(coalesce(p_limit, 2), 16)) * 16));
  v_pool text := upper(coalesce(nullif(trim(p_pool), ''), ''));
begin
  if v_pool not in ('CORE', 'SEMANTIC', 'GOVERNANCE') then
    raise exception 'Unsupported workload pool: %', coalesce(p_pool, '<null>') using errcode = '22023';
  end if;

  return query
  select q.*
    from orchestration.job_queue q
   where q.status = 'RUNNING'
     and q.lease_owner = p_worker
     and q.lease_expires_at > now()
     and (
       (v_pool = 'SEMANTIC' and q.job_type = 'SEMANTIC_INDEX')
       or (v_pool = 'GOVERNANCE' and q.job_type = 'GOVERNANCE_AGENT')
       or (
         v_pool = 'CORE'
         and q.job_type not in ('SEMANTIC_INDEX', 'GOVERNANCE_AGENT')
         and not (
           q.job_type = 'OBSERVABILITY'
           and coalesce(q.payload->>'executionLane', '') = 'CLOUDFLARE_CANARY'
         )
       )
     )
   order by q.priority asc, q.created_at asc
   limit v_limit;

  get diagnostics v_count = row_count;
  if v_count > 0 then
    return;
  end if;
  v_count := 0;

  for v_candidate in
    select q.*
      from orchestration.job_queue q
     where q.status = 'QUEUED'
       and q.available_at <= now()
       and (q.lease_expires_at is null or q.lease_expires_at < now())
       and q.attempts < q.max_attempts
       and (
         (v_pool = 'SEMANTIC' and q.job_type = 'SEMANTIC_INDEX')
         or (v_pool = 'GOVERNANCE' and q.job_type = 'GOVERNANCE_AGENT')
         or (
           v_pool = 'CORE'
           and q.job_type not in ('SEMANTIC_INDEX', 'GOVERNANCE_AGENT')
           and not (
             q.job_type = 'OBSERVABILITY'
             and coalesce(q.payload->>'executionLane', '') = 'CLOUDFLARE_CANARY'
           )
         )
       )
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
     limit v_scan_limit
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
    returning q.* into v_claimed;

    if found then
      v_count := v_count + 1;
      return next v_claimed;
      exit when v_count >= v_limit;
    end if;
  end loop;

  return;
end;
$function$;

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
      v_count := v_count + 1;
      return next v_claimed;
      exit when v_count >= v_limit;
    end if;
  end loop;

  return;
end;
$function$;

revoke execute on function orchestration.claim_jobs_by_pool(text,text,integer) from public,anon,authenticated;
grant execute on function orchestration.claim_jobs_by_pool(text,text,integer) to service_role;
revoke execute on function orchestration.claim_jobs_by_type(text,text,integer) from public,anon,authenticated;
grant execute on function orchestration.claim_jobs_by_type(text,text,integer) to service_role;

create index if not exists idx_job_queue_cloudflare_observability_canary
  on orchestration.job_queue(status, available_at, priority, created_at)
  where status = 'QUEUED'
    and job_type = 'OBSERVABILITY'
    and coalesce(payload->>'executionLane', '') = 'CLOUDFLARE_CANARY';

select pg_notify('pgrst','reload schema');
