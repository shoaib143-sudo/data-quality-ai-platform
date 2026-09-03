create or replace function orchestration.claim_jobs(p_worker text, p_limit integer default 2)
returns setof orchestration.job_queue
language plpgsql
security definer
set search_path = pg_catalog, orchestration
as $$
begin
  return query
  with candidates as (
    select id
    from orchestration.job_queue
    where status='QUEUED'
      and available_at <= now()
      and (lease_expires_at is null or lease_expires_at < now())
    order by priority asc, created_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,2),10))
  )
  update orchestration.job_queue q
  set status='RUNNING',
      lease_owner=p_worker,
      lease_expires_at=now()+interval '10 minutes',
      attempts=q.attempts+1,
      started_at=coalesce(q.started_at,now()),
      updated_at=now()
  from candidates c
  where q.id=c.id
  returning q.*;
end;
$$;

revoke execute on function orchestration.claim_jobs(text,integer) from public,anon,authenticated;
grant execute on function orchestration.claim_jobs(text,integer) to service_role;

create or replace function orchestration.release_stale_jobs()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, orchestration
as $$
declare v_count integer;
begin
  update orchestration.job_queue
  set status=case when attempts >= max_attempts then 'DEAD' else 'QUEUED' end,
      available_at=case when attempts >= max_attempts then available_at else now()+make_interval(mins => least(60, greatest(1, attempts*5))) end,
      lease_owner=null,
      lease_expires_at=null,
      last_error=coalesce(last_error,'Worker lease expired before completion.'),
      updated_at=now(),
      completed_at=case when attempts >= max_attempts then now() else null end
  where status='RUNNING' and lease_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function orchestration.release_stale_jobs() from public,anon,authenticated;
grant execute on function orchestration.release_stale_jobs() to service_role;

select pg_notify('pgrst','reload schema');
