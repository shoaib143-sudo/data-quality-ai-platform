create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='DGP_DURABLE_WORKER_SECRET') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'DGP_DURABLE_WORKER_SECRET','Database cron credential for the durable application worker');
  end if;
end $$;

create or replace function orchestration.verify_worker_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,vault
as $$
  select exists(
    select 1
    from vault.decrypted_secrets
    where name='DGP_DURABLE_WORKER_SECRET'
      and decrypted_secret=p_secret
  );
$$;
revoke execute on function orchestration.verify_worker_secret(text) from public,anon,authenticated;
grant execute on function orchestration.verify_worker_secret(text) to service_role;

create or replace function orchestration.kick_durable_worker()
returns bigint
language plpgsql
security definer
set search_path=pg_catalog,vault,net
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='DGP_DURABLE_WORKER_SECRET'
  limit 1;
  if v_secret is null then raise exception 'Durable worker secret is unavailable'; end if;

  select net.http_get(
    url:='https://data-quality-ai-platform.vercel.app/api/jobs/worker',
    headers:=jsonb_build_object('Authorization','Bearer '||v_secret,'User-Agent','datanexus-db-cron/1.0'),
    timeout_milliseconds:=10000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke execute on function orchestration.kick_durable_worker() from public,anon,authenticated;
grant execute on function orchestration.kick_durable_worker() to service_role;

create or replace function orchestration.recover_orphaned_runs(p_stale_minutes integer default 30)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,orchestration,agent,profiling
as $$
declare
  v_profile_count integer:=0;
  v_agent_count integer:=0;
  v_cutoff timestamptz:=now()-make_interval(mins=>greatest(5,coalesce(p_stale_minutes,30)));
begin
  perform orchestration.release_stale_jobs();

  with stale as (
    select pr.id
    from profiling.profile_runs pr
    where pr.status='RUNNING'
      and pr.started_at<v_cutoff
      and not exists(
        select 1 from orchestration.job_queue q
        where q.agent_run_id=pr.agent_run_id
          and q.status in ('QUEUED','RUNNING')
      )
  )
  update profiling.profile_runs pr
  set status='FAILED',
      error_code=coalesce(pr.error_code,'ORPHANED_RUN_RECOVERED'),
      error_message=coalesce(pr.error_message,'Profiling run was recovered after exceeding the stale execution window without an active durable job.'),
      completed_at=coalesce(pr.completed_at,now()),
      summary=coalesce(pr.summary,'{}'::jsonb)||jsonb_build_object('recovery',jsonb_build_object('recovered_at',now(),'reason','NO_ACTIVE_DURABLE_JOB'))
  from stale s
  where pr.id=s.id;
  get diagnostics v_profile_count=row_count;

  with stale as (
    select ar.id
    from agent.agent_runs ar
    where ar.status in ('CREATED','QUEUED','RUNNING','WAITING')
      and coalesce(ar.started_at,ar.created_at)<v_cutoff
      and not exists(
        select 1 from orchestration.job_queue q
        where q.agent_run_id=ar.id
          and q.status in ('QUEUED','RUNNING')
      )
  )
  update agent.agent_runs ar
  set status='FAILED',
      error_code=coalesce(ar.error_code,'ORPHANED_RUN_RECOVERED'),
      error_message=coalesce(ar.error_message,'Agent run was recovered after exceeding the stale execution window without an active durable job.'),
      completed_at=coalesce(ar.completed_at,now())
  from stale s
  where ar.id=s.id;
  get diagnostics v_agent_count=row_count;

  return jsonb_build_object('profile_runs_recovered',v_profile_count,'agent_runs_recovered',v_agent_count,'cutoff',v_cutoff);
end;
$$;
revoke execute on function orchestration.recover_orphaned_runs(integer) from public,anon,authenticated;
grant execute on function orchestration.recover_orphaned_runs(integer) to service_role;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='dgp-durable-worker-kick' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('dgp-durable-worker-kick','* * * * *','select orchestration.kick_durable_worker();');

  select jobid into v_job from cron.job where jobname='dgp-orphan-run-recovery' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('dgp-orphan-run-recovery','*/10 * * * *','select orchestration.recover_orphaned_runs(30);');
end $$;

select pg_notify('pgrst','reload schema');
