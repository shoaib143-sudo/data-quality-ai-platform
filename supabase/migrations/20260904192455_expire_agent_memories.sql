create or replace function agent.expire_agent_memories(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer := 0;
begin
  if coalesce(auth.role(),'') <> 'service_role' and session_user not in ('postgres','supabase_admin') then
    raise exception 'service role required';
  end if;
  with due as (
    select id from agent.agent_memories
    where status='ACTIVE' and expires_at is not null and expires_at <= now()
    order by expires_at
    limit greatest(1,least(coalesce(p_limit,500),5000))
    for update skip locked
  )
  update agent.agent_memories m
  set status='EXPIRED',updated_at=now()
  from due where m.id=due.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function agent.expire_agent_memories(integer) from public,anon,authenticated;
grant execute on function agent.expire_agent_memories(integer) to service_role;
do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='dgp-agent-memory-expiry';
    perform cron.schedule('dgp-agent-memory-expiry','17 * * * *',$cron$select agent.expire_agent_memories(1000);$cron$);
  end if;
end;
$$;
