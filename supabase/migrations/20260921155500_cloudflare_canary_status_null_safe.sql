-- Make Cloudflare canary operational status null-safe before live activation.
-- Missing Vault rows must report explicit false rather than null.

create or replace function orchestration.get_cloudflare_observability_canary_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, orchestration, vault, cron
as $function$
  with vault_state as (
    select
      coalesce(bool_or(name = 'DGP_CLOUDFLARE_WORKER_URL' and coalesce(decrypted_secret,'') <> ''), false) as worker_url_configured,
      coalesce(bool_or(name = 'DGP_CLOUDFLARE_WORKER_SECRET' and coalesce(decrypted_secret,'') <> ''), false) as worker_secret_configured,
      coalesce(
        max(case when name = 'DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED' then lower(btrim(decrypted_secret)) end) = 'true',
        false
      ) as enabled
    from vault.decrypted_secrets
    where name in (
      'DGP_CLOUDFLARE_WORKER_URL',
      'DGP_CLOUDFLARE_WORKER_SECRET',
      'DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED'
    )
  ),
  cron_state as (
    select
      coalesce(bool_or(active), false) as cron_active,
      max(schedule) as cron_schedule
    from cron.job
    where jobname = 'dgp-cloudflare-observability-canary-kick'
  ),
  queue_state as (
    select
      count(*) filter (where status = 'QUEUED') as queued,
      count(*) filter (where status = 'RUNNING') as running,
      count(*) filter (where status = 'SUCCEEDED') as succeeded,
      count(*) filter (where status in ('FAILED','DEAD')) as failed
    from orchestration.job_queue
    where job_type = 'OBSERVABILITY'
      and coalesce(payload->>'executionLane','') = 'CLOUDFLARE_CANARY'
  )
  select jsonb_build_object(
    'enabled', v.enabled,
    'worker_url_configured', v.worker_url_configured,
    'worker_secret_configured', v.worker_secret_configured,
    'runtime_configured', v.worker_url_configured and v.worker_secret_configured,
    'cron_active', c.cron_active,
    'cron_schedule', c.cron_schedule,
    'queued', q.queued,
    'running', q.running,
    'succeeded', q.succeeded,
    'failed', q.failed,
    'single_flight_limit', 1,
    'allowed_job_type', 'OBSERVABILITY',
    'scheduler_authority', 'Supabase'
  )
  from vault_state v
  cross join cron_state c
  cross join queue_state q;
$function$;

revoke all on function orchestration.get_cloudflare_observability_canary_status() from public,anon,authenticated;
grant execute on function orchestration.get_cloudflare_observability_canary_status() to service_role;

select pg_notify('pgrst','reload schema');
