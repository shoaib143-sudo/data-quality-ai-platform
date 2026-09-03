create or replace function orchestration.claim_job_by_agent_run(p_worker text, p_agent_run_id uuid)
returns orchestration.job_queue
language plpgsql
security definer
set search_path = pg_catalog, orchestration
as $$
declare v_job orchestration.job_queue;
begin
  select * into v_job
  from orchestration.job_queue
  where agent_run_id=p_agent_run_id
    and status='QUEUED'
    and available_at <= now()
    and (lease_expires_at is null or lease_expires_at < now())
  for update skip locked;

  if not found then return null; end if;

  update orchestration.job_queue
  set status='RUNNING',
      lease_owner=p_worker,
      lease_expires_at=now()+interval '10 minutes',
      attempts=attempts+1,
      started_at=coalesce(started_at,now()),
      updated_at=now()
  where id=v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke execute on function orchestration.claim_job_by_agent_run(text,uuid) from public,anon,authenticated;
grant execute on function orchestration.claim_job_by_agent_run(text,uuid) to service_role;
select pg_notify('pgrst','reload schema');
