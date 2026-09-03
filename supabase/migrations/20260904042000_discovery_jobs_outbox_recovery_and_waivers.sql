alter table orchestration.job_queue drop constraint if exists job_queue_job_type_check;
alter table orchestration.job_queue add constraint job_queue_job_type_check
check(job_type in ('PROFILING','DATA_QUALITY','NOTIFICATION','OBSERVABILITY','DISCOVERY'));

create or replace function orchestration.claim_events(p_worker text,p_limit integer default 20)
returns setof orchestration.event_outbox language plpgsql security definer set search_path=pg_catalog,orchestration
as $$
begin
  update orchestration.event_outbox
  set status=case when attempts>=max_attempts then 'DEAD' else 'FAILED' end,
      available_at=case when attempts>=max_attempts then available_at else now()+make_interval(mins=>least(60,greatest(1,2^greatest(0,attempts-1)))) end,
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
    limit greatest(1,least(coalesce(p_limit,20),100))
  )
  update orchestration.event_outbox e
  set status='PROCESSING',lease_owner=p_worker,lease_expires_at=now()+interval '5 minutes',attempts=e.attempts+1,last_error=null
  from candidates c where e.id=c.id returning e.*;
end;
$$;
revoke execute on function orchestration.claim_events(text,integer) from public,anon,authenticated;
grant execute on function orchestration.claim_events(text,integer) to service_role;

create or replace function profiling.expire_quality_rule_waivers()
returns integer language plpgsql security definer set search_path=pg_catalog,profiling
as $$
declare v_count integer;
begin
  update profiling.quality_rule_exceptions
  set status='OPEN',
      waiver_reason=null,
      approved_by=null,
      approved_at=null,
      resolution_notes=coalesce(resolution_notes,'')||case when coalesce(resolution_notes,'')='' then '' else E'\n' end||'Approved waiver expired automatically at '||now()::text
  where status='WAIVED' and expires_at is not null and expires_at<=now();
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke execute on function profiling.expire_quality_rule_waivers() from public,anon,authenticated;
grant execute on function profiling.expire_quality_rule_waivers() to service_role;

select cron.schedule('dgp-quality-waiver-expiry','11 * * * *','select profiling.expire_quality_rule_waivers();')
where not exists(select 1 from cron.job where jobname='dgp-quality-waiver-expiry');

select pg_notify('pgrst','reload schema');
