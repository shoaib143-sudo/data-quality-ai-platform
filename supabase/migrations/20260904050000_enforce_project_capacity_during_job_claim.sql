create or replace function orchestration.claim_jobs(p_worker text,p_limit integer default 2)
returns setof orchestration.job_queue
language plpgsql
security definer
set search_path=pg_catalog,orchestration
as $$
declare
  v_candidate orchestration.job_queue%rowtype;
  v_claimed orchestration.job_queue%rowtype;
  v_count integer:=0;
  v_running integer;
  v_max integer;
begin
  for v_candidate in
    select * from orchestration.job_queue
    where status='QUEUED'
      and available_at<=now()
      and (lease_expires_at is null or lease_expires_at<now())
      and attempts<max_attempts
    order by priority asc,created_at asc
    for update skip locked
  loop
    select coalesce(cp.max_concurrent_jobs,4) into v_max
    from (select v_candidate.project_id as project_id) p
    left join orchestration.capacity_policies cp on cp.project_id=p.project_id;

    select count(*) into v_running
    from orchestration.job_queue q
    where q.project_id=v_candidate.project_id and q.status='RUNNING';

    if v_running>=v_max then continue; end if;

    update orchestration.job_queue
    set status='RUNNING',lease_owner=p_worker,lease_expires_at=now()+interval '10 minutes',attempts=attempts+1,
        started_at=coalesce(started_at,now()),updated_at=now()
    where id=v_candidate.id and status='QUEUED'
    returning * into v_claimed;

    if found then
      v_count:=v_count+1;
      return next v_claimed;
      exit when v_count>=greatest(1,least(coalesce(p_limit,2),10));
    end if;
  end loop;
  return;
end;
$$;
revoke execute on function orchestration.claim_jobs(text,integer) from public,anon,authenticated;
grant execute on function orchestration.claim_jobs(text,integer) to service_role;

create or replace function orchestration.claim_job_by_agent_run(p_worker text,p_agent_run_id uuid)
returns orchestration.job_queue
language plpgsql
security definer
set search_path=pg_catalog,orchestration
as $$
declare
  v_job orchestration.job_queue;
  v_running integer;
  v_max integer;
begin
  select * into v_job
  from orchestration.job_queue
  where agent_run_id=p_agent_run_id
    and status='QUEUED'
    and available_at<=now()
    and (lease_expires_at is null or lease_expires_at<now())
    and attempts<max_attempts
  for update skip locked;
  if not found then return null; end if;

  select coalesce(cp.max_concurrent_jobs,4) into v_max
  from (select v_job.project_id as project_id) p
  left join orchestration.capacity_policies cp on cp.project_id=p.project_id;

  select count(*) into v_running
  from orchestration.job_queue q
  where q.project_id=v_job.project_id and q.status='RUNNING';
  if v_running>=v_max then return null; end if;

  update orchestration.job_queue
  set status='RUNNING',lease_owner=p_worker,lease_expires_at=now()+interval '10 minutes',attempts=attempts+1,
      started_at=coalesce(started_at,now()),updated_at=now()
  where id=v_job.id and status='QUEUED'
  returning * into v_job;
  return v_job;
end;
$$;
revoke execute on function orchestration.claim_job_by_agent_run(text,uuid) from public,anon,authenticated;
grant execute on function orchestration.claim_job_by_agent_run(text,uuid) to service_role;

select pg_notify('pgrst','reload schema');
