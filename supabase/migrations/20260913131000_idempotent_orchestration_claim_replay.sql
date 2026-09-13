-- Make orchestration claims safely replayable after an API gateway timeout.
-- The worker reuses the same p_worker value for the retry. If the first request
-- committed but its response was lost, the retry returns the already leased rows
-- instead of claiming additional work or incrementing attempts again.

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

  -- Idempotent transport replay. Worker IDs are unique per invocation/round/pool.
  -- A retry with the same p_worker returns the original live lease instead of
  -- advancing attempts or claiming another batch.
  return query
  select q.*
    from orchestration.job_queue q
   where q.status = 'RUNNING'
     and q.lease_owner = p_worker
     and q.lease_expires_at > now()
     and (
       (v_pool = 'SEMANTIC' and q.job_type = 'SEMANTIC_INDEX')
       or (v_pool = 'GOVERNANCE' and q.job_type = 'GOVERNANCE_AGENT')
       or (v_pool = 'CORE' and q.job_type not in ('SEMANTIC_INDEX', 'GOVERNANCE_AGENT'))
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
         or (v_pool = 'CORE' and q.job_type not in ('SEMANTIC_INDEX', 'GOVERNANCE_AGENT'))
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

create or replace function orchestration.claim_events(
  p_worker text,
  p_limit integer default 20
)
returns setof orchestration.event_outbox
language plpgsql
security definer
set search_path to 'pg_catalog', 'orchestration'
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_replayed integer := 0;
begin
  -- Same replay contract as durable jobs. A lost successful response can be
  -- retried with the same worker identity without leasing a second event batch.
  return query
  select e.*
    from orchestration.event_outbox e
   where e.status = 'PROCESSING'
     and e.lease_owner = p_worker
     and e.lease_expires_at > now()
   order by e.created_at
   limit v_limit;

  get diagnostics v_replayed = row_count;
  if v_replayed > 0 then
    return;
  end if;

  update orchestration.event_outbox
  set status=case when attempts>=max_attempts then 'DEAD' else 'FAILED' end,
      available_at=case
        when attempts>=max_attempts then available_at
        else now()+make_interval(
          mins => least(60::numeric,greatest(1::numeric,power(2::numeric,greatest(0,attempts-1))))::integer
        )
      end,
      lease_owner=null,
      lease_expires_at=null,
      last_error=coalesce(last_error,'Event worker lease expired before completion.'),
      processed_at=case when attempts>=max_attempts then now() else null end
  where status='PROCESSING' and lease_expires_at<now();

  return query
  with candidates as (
    select id from orchestration.event_outbox
    where status in ('PENDING','FAILED') and available_at<=now()
      and (lease_expires_at is null or lease_expires_at<now()) and attempts<max_attempts
    order by created_at for update skip locked
    limit v_limit
  )
  update orchestration.event_outbox e
  set status='PROCESSING',
      lease_owner=p_worker,
      lease_expires_at=now()+interval '5 minutes',
      attempts=e.attempts+1,
      last_error=null
  from candidates c
  where e.id=c.id
  returning e.*;
end;
$function$;
