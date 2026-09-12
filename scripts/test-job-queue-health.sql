\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema orchestration;
grant usage on schema orchestration to service_role;

create table orchestration.job_queue (
  id uuid primary key,
  project_id uuid not null,
  job_type text not null,
  entity_id uuid null,
  status text not null,
  completed_at timestamptz null,
  lease_expires_at timestamptz null
);
grant select on orchestration.job_queue to service_role;

\ir ../supabase/migrations/20260912193000_job_queue_health_probe.sql

-- Idle queue must be healthy, not degraded for lack of recent activity.
do $$
declare v jsonb;
begin
  select orchestration.verify_job_queue_health() into v;
  if v->>'status' <> 'READY' or coalesce((v->>'idle')::boolean, false) is not true then
    raise exception 'idle queue should be READY and idle: %', v;
  end if;
end $$;

-- Recent success is activity but remains healthy.
insert into orchestration.job_queue values
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','PROFILE','20000000-0000-0000-0000-000000000001','SUCCEEDED',statement_timestamp() - interval '1 minute',null);
do $$
declare v jsonb;
begin
  select orchestration.verify_job_queue_health() into v;
  if v->>'status' <> 'READY' or coalesce((v->>'idle')::boolean, true) is not false then
    raise exception 'active successful queue should be READY and non-idle: %', v;
  end if;
end $$;

truncate orchestration.job_queue;

-- An unresolved recent DEAD job degrades health.
insert into orchestration.job_queue values
('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','PROFILE','20000000-0000-0000-0000-000000000002','DEAD',statement_timestamp() - interval '2 minutes',null);
do $$
declare v jsonb;
begin
  select orchestration.verify_job_queue_health() into v;
  if v->>'status' <> 'DEGRADED' or (v->>'unresolved_dead')::integer <> 1 then
    raise exception 'unresolved DEAD job should degrade queue: %', v;
  end if;
end $$;

-- A later success with the same execution identity resolves that dead job.
insert into orchestration.job_queue values
('00000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','PROFILE','20000000-0000-0000-0000-000000000002','SUCCEEDED',statement_timestamp() - interval '1 minute',null);
do $$
declare v jsonb;
begin
  select orchestration.verify_job_queue_health() into v;
  if v->>'status' <> 'READY' or (v->>'unresolved_dead')::integer <> 0 then
    raise exception 'later success should resolve matching dead job: %', v;
  end if;
end $$;

truncate orchestration.job_queue;

-- Null entity IDs are part of the execution identity and must recover correctly.
insert into orchestration.job_queue values
('00000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','GLOBAL',null,'DEAD',statement_timestamp() - interval '2 minutes',null),
('00000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','GLOBAL',null,'SUCCEEDED',statement_timestamp() - interval '1 minute',null);
do $$
declare v jsonb;
begin
  select orchestration.verify_job_queue_health() into v;
  if v->>'status' <> 'READY' or (v->>'unresolved_dead')::integer <> 0 then
    raise exception 'null entity recovery identity should resolve: %', v;
  end if;
end $$;

truncate orchestration.job_queue;

-- Stale leases degrade; healthy active leases do not.
insert into orchestration.job_queue values
('00000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','PROFILE',null,'RUNNING',null,statement_timestamp() - interval '1 minute');
do $$
declare v jsonb;
begin
  select orchestration.verify_job_queue_health() into v;
  if v->>'status' <> 'DEGRADED' or (v->>'stale_running')::integer <> 1 then
    raise exception 'stale running lease should degrade queue: %', v;
  end if;
end $$;

truncate orchestration.job_queue;
insert into orchestration.job_queue values
('00000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','PROFILE',null,'RUNNING',null,statement_timestamp() + interval '5 minutes');
do $$
declare v jsonb;
begin
  select orchestration.verify_job_queue_health() into v;
  if v->>'status' <> 'READY' or (v->>'active_running')::integer <> 1 or coalesce((v->>'idle')::boolean, true) is not false then
    raise exception 'active running lease should be healthy and non-idle: %', v;
  end if;
end $$;

-- Invalid windows fail closed instead of silently changing semantics.
do $$
begin
  begin
    perform orchestration.verify_job_queue_health(0);
    raise exception 'expected invalid window failure';
  exception when sqlstate '22023' then
    null;
  end;
end $$;

-- API roles cannot invoke the operational health function.
do $$
begin
  if has_function_privilege('anon','orchestration.verify_job_queue_health(integer)','EXECUTE')
     or has_function_privilege('authenticated','orchestration.verify_job_queue_health(integer)','EXECUTE')
     or not has_function_privilege('service_role','orchestration.verify_job_queue_health(integer)','EXECUTE') then
    raise exception 'queue health RPC ACL contract violated';
  end if;
end $$;

select 'Job queue health dynamic and negative tests passed.' as result;
