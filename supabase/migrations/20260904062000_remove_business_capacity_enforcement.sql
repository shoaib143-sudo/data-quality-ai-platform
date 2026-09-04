create or replace function orchestration.claim_jobs(p_worker text,p_limit integer default 2)
returns setof orchestration.job_queue
language plpgsql
security definer
set search_path=pg_catalog,orchestration
as $$
begin
  return query
  with candidates as (
    select id
    from orchestration.job_queue
    where status='QUEUED'
      and available_at<=now()
      and (lease_expires_at is null or lease_expires_at<now())
      and attempts<max_attempts
    order by priority asc,created_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,2),50))
  )
  update orchestration.job_queue q
  set status='RUNNING',lease_owner=p_worker,lease_expires_at=now()+interval '10 minutes',
      attempts=q.attempts+1,started_at=coalesce(q.started_at,now()),updated_at=now()
  from candidates c
  where q.id=c.id
  returning q.*;
end;
$$;

create or replace function orchestration.claim_job_by_agent_run(p_worker text,p_agent_run_id uuid)
returns orchestration.job_queue
language plpgsql
security definer
set search_path=pg_catalog,orchestration
as $$
declare v_job orchestration.job_queue;
begin
  update orchestration.job_queue
  set status='RUNNING',lease_owner=p_worker,lease_expires_at=now()+interval '10 minutes',
      attempts=attempts+1,started_at=coalesce(started_at,now()),updated_at=now()
  where id=(
    select id from orchestration.job_queue
    where agent_run_id=p_agent_run_id and status='QUEUED' and available_at<=now()
      and (lease_expires_at is null or lease_expires_at<now()) and attempts<max_attempts
    order by created_at desc limit 1 for update skip locked
  )
  returning * into v_job;
  return v_job;
end;
$$;

revoke execute on function orchestration.claim_jobs(text,integer) from public,anon,authenticated;
revoke execute on function orchestration.claim_job_by_agent_run(text,uuid) from public,anon,authenticated;
grant execute on function orchestration.claim_jobs(text,integer),orchestration.claim_job_by_agent_run(text,uuid) to service_role;

comment on table orchestration.capacity_policies is 'Advisory operating targets for dashboards and telemetry only. These values do not reject, defer, throttle, or truncate production work.';
select pg_notify('pgrst','reload schema');
