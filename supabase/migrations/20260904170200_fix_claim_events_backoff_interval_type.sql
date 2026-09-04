create or replace function orchestration.claim_events(p_worker text,p_limit integer default 20)
returns setof orchestration.event_outbox language plpgsql security definer
set search_path=pg_catalog,orchestration
as $$
begin
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
    limit greatest(1,least(coalesce(p_limit,20),100))
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
$$;

revoke execute on function orchestration.claim_events(text,integer) from public,anon,authenticated;
grant execute on function orchestration.claim_events(text,integer) to service_role;
