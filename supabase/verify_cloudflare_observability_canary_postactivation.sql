-- Live post-activation certification for the controlled Cloudflare
-- OBSERVABILITY canary lane. This script is read-only and fail-closed.

do $$
declare
  v_status jsonb;
  v_running integer;
  v_invalid_owner integer;
begin
  select orchestration.get_cloudflare_observability_canary_status() into v_status;

  if coalesce((v_status->>'enabled')::boolean,false) is not true then
    raise exception 'Cloudflare canary is not enabled: %', v_status;
  end if;
  if coalesce((v_status->>'runtime_configured')::boolean,false) is not true then
    raise exception 'Cloudflare canary runtime configuration is incomplete: %', v_status;
  end if;
  if coalesce((v_status->>'cron_active')::boolean,false) is not true
     or v_status->>'cron_schedule' <> '*/5 * * * *' then
    raise exception 'Cloudflare canary scheduler is not active at expected cadence: %', v_status;
  end if;
  if v_status->>'allowed_job_type' <> 'OBSERVABILITY'
     or v_status->>'scheduler_authority' <> 'Supabase'
     or coalesce((v_status->>'single_flight_limit')::integer,0) <> 1 then
    raise exception 'Cloudflare canary authority contract invalid: %', v_status;
  end if;

  select count(*) into v_running
  from orchestration.job_queue
  where job_type='OBSERVABILITY'
    and coalesce(payload->>'executionLane','')='CLOUDFLARE_CANARY'
    and status='RUNNING';

  if v_running > 1 then
    raise exception 'Cloudflare canary single-flight violated: % running jobs', v_running;
  end if;

  select count(*) into v_invalid_owner
  from orchestration.job_queue
  where job_type='OBSERVABILITY'
    and coalesce(payload->>'executionLane','')='CLOUDFLARE_CANARY'
    and status='RUNNING'
    and coalesce(lease_owner,'') not like 'cloudflare-observability-canary:%';

  if v_invalid_owner > 0 then
    raise exception 'Cloudflare canary job is owned by an unexpected worker';
  end if;
end
$$;

select jsonb_build_object(
  'status','PASS',
  'activation_state','enabled',
  'runtime_configuration','verified',
  'scheduler','verified',
  'single_flight','verified',
  'lease_owner_boundary','verified'
) as cloudflare_observability_canary_postactivation_certification;
