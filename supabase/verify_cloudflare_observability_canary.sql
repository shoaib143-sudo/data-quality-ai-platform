-- Repeatable, non-destructive live certification for the controlled
-- Cloudflare OBSERVABILITY canary lane.
-- This script is designed to fail closed and rolls back synthetic queue data.

do $$
declare
  v_invalid_url_rejected boolean := false;
  v_short_secret_rejected boolean := false;
begin
  if to_regprocedure('orchestration.claim_jobs_by_type(text,text,integer)') is null then
    raise exception 'Missing orchestration.claim_jobs_by_type(text,text,integer)';
  end if;
  if to_regprocedure('orchestration.configure_cloudflare_observability_canary(text,text,boolean)') is null then
    raise exception 'Missing orchestration.configure_cloudflare_observability_canary(text,text,boolean)';
  end if;
  if to_regprocedure('orchestration.kick_cloudflare_observability_canary()') is null then
    raise exception 'Missing orchestration.kick_cloudflare_observability_canary()';
  end if;

  if not has_function_privilege('service_role','orchestration.claim_jobs_by_type(text,text,integer)','EXECUTE')
     or has_function_privilege('authenticated','orchestration.claim_jobs_by_type(text,text,integer)','EXECUTE')
     or has_function_privilege('anon','orchestration.claim_jobs_by_type(text,text,integer)','EXECUTE') then
    raise exception 'Canary claim RPC privilege boundary invalid';
  end if;

  if not has_function_privilege('service_role','orchestration.configure_cloudflare_observability_canary(text,text,boolean)','EXECUTE')
     or has_function_privilege('authenticated','orchestration.configure_cloudflare_observability_canary(text,text,boolean)','EXECUTE')
     or has_function_privilege('anon','orchestration.configure_cloudflare_observability_canary(text,text,boolean)','EXECUTE') then
    raise exception 'Canary configuration RPC privilege boundary invalid';
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname='dgp-cloudflare-observability-canary-kick'
      and schedule='*/5 * * * *'
      and active
  ) then
    raise exception 'Cloudflare canary scheduler missing, disabled, or wrong cadence';
  end if;

  if orchestration.kick_cloudflare_observability_canary() is not null then
    raise exception 'Cloudflare canary scheduler must be a no-op while activation flag is absent/false';
  end if;

  begin
    perform orchestration.configure_cloudflare_observability_canary(
      'http://not-https/api/jobs/worker',
      repeat('x',40),
      false
    );
  exception when sqlstate '22023' then
    v_invalid_url_rejected := true;
  end;

  begin
    perform orchestration.configure_cloudflare_observability_canary(
      'https://datanexus-worker-canary.shoaib-akram.workers.dev/api/jobs/worker',
      'short',
      false
    );
  exception when sqlstate '22023' then
    v_short_secret_rejected := true;
  end;

  if not v_invalid_url_rejected then
    raise exception 'Invalid canary URL was not rejected';
  end if;
  if not v_short_secret_rejected then
    raise exception 'Short canary secret was not rejected';
  end if;
end
$$;

begin;

do $$
declare
  v_project uuid;
  v_first uuid := '33333333-3333-4333-8333-333333333333';
  v_second uuid := '44444444-4444-4444-8444-444444444444';
  v_normal uuid := '55555555-5555-4555-8555-555555555555';
  v_claim_a uuid[];
  v_claim_b uuid[];
  v_replay uuid[];
  v_core uuid[];
begin
  select id into v_project
  from app.projects
  order by created_at asc
  limit 1;

  if v_project is null then
    raise exception 'No project available for transactional canary certification';
  end if;

  insert into orchestration.job_queue(
    id,project_id,job_type,payload,status,priority,max_attempts,available_at,idempotency_key
  )
  values
    (v_first,v_project,'OBSERVABILITY',jsonb_build_object('executionLane','CLOUDFLARE_CANARY'),'QUEUED',-10000,3,now(),'canary-cert-first'),
    (v_second,v_project,'OBSERVABILITY',jsonb_build_object('executionLane','CLOUDFLARE_CANARY'),'QUEUED',-9999,3,now(),'canary-cert-second'),
    (v_normal,v_project,'OBSERVABILITY','{}'::jsonb,'QUEUED',-9998,3,now(),'canary-cert-normal');

  select coalesce(array_agg(id),'{}'::uuid[])
  into v_core
  from orchestration.claim_jobs_by_pool('cert-core','CORE',8)
  where id in (v_first,v_second,v_normal);

  if v_first = any(v_core) or v_second = any(v_core) then
    raise exception 'CORE claim path consumed a Cloudflare canary-tagged job: %', v_core;
  end if;
  if not (v_normal = any(v_core)) then
    raise exception 'CORE claim path failed to consume normal OBSERVABILITY job: %', v_core;
  end if;

  select coalesce(array_agg(id),'{}'::uuid[])
  into v_claim_a
  from orchestration.claim_jobs_by_type('cert-canary-a','OBSERVABILITY',4)
  where id in (v_first,v_second);

  if cardinality(v_claim_a) <> 1 then
    raise exception 'Initial canary claim must be exactly one job: %', v_claim_a;
  end if;

  select coalesce(array_agg(id),'{}'::uuid[])
  into v_claim_b
  from orchestration.claim_jobs_by_type('cert-canary-b','OBSERVABILITY',4)
  where id in (v_first,v_second);

  if cardinality(v_claim_b) <> 0 then
    raise exception 'Second canary worker must be blocked by single-flight lease: %', v_claim_b;
  end if;

  select coalesce(array_agg(id),'{}'::uuid[])
  into v_replay
  from orchestration.claim_jobs_by_type('cert-canary-a','OBSERVABILITY',4)
  where id in (v_first,v_second);

  if v_replay <> v_claim_a then
    raise exception 'Same-worker replay did not return the existing live lease: first=% replay=%', v_claim_a, v_replay;
  end if;
end
$$;

rollback;

select jsonb_build_object(
  'status','PASS',
  'claim_rpc','service_role_only',
  'scheduler','installed_fail_closed',
  'core_canary_isolation','verified',
  'single_flight','verified',
  'idempotent_replay','verified',
  'negative_config','verified'
) as cloudflare_observability_canary_certification;
