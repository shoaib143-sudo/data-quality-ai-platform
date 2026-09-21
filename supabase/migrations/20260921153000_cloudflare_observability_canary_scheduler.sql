-- Governed Supabase scheduler for the isolated Cloudflare OBSERVABILITY canary lane.
-- The existing durable-worker scheduler remains authoritative for normal work.
-- This scheduler only emits the CLOUDFLARE_OBSERVABILITY_CANARY mode and is
-- fail-closed unless an explicit Vault flag is enabled.

create or replace function orchestration.configure_cloudflare_observability_canary(
  p_worker_url text,
  p_worker_secret text,
  p_enabled boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, vault
as $function$
declare
  v_id uuid;
  v_url text := btrim(coalesce(p_worker_url, ''));
  v_secret text := btrim(coalesce(p_worker_secret, ''));
begin
  if v_url !~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?/api/jobs/worker
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, net
as $function$
declare
  worker_secret text;
  worker_url text;
  canary_enabled text;
  request_id bigint;
begin
  select decrypted_secret
    into canary_enabled
    from vault.decrypted_secrets
   where name = 'DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED'
   limit 1;

  if lower(btrim(coalesce(canary_enabled, ''))) <> 'true' then
    return null;
  end if;

  select decrypted_secret
    into worker_secret
    from vault.decrypted_secrets
   where name = 'DGP_CLOUDFLARE_WORKER_SECRET'
   limit 1;

  select decrypted_secret
    into worker_url
    from vault.decrypted_secrets
   where name = 'DGP_CLOUDFLARE_WORKER_URL'
   limit 1;

  if worker_secret is null or btrim(worker_secret) = '' then
    raise exception 'DGP_CLOUDFLARE_WORKER_SECRET is required for Cloudflare canary dispatch';
  end if;

  if worker_url is null or btrim(worker_url) = '' then
    raise exception 'DGP_CLOUDFLARE_WORKER_URL is required for Cloudflare canary dispatch';
  end if;

  worker_url := btrim(worker_url);
  if worker_url !~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?/api/jobs/worker$' then
    raise exception 'DGP_CLOUDFLARE_WORKER_URL must be an exact HTTPS /api/jobs/worker endpoint';
  end if;

  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || worker_secret,
      'Content-Type', 'application/json',
      'User-Agent', 'datanexus-cloudflare-canary-dispatch/1.0'
    ),
    body := jsonb_build_object(
      'mode', 'CLOUDFLARE_OBSERVABILITY_CANARY',
      'source', 'SUPABASE_CANARY_SCHEDULER'
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end;
$function$;

revoke all on function orchestration.kick_cloudflare_observability_canary() from public,anon,authenticated;
grant execute on function orchestration.kick_cloudflare_observability_canary() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'dgp-cloudflare-observability-canary-kick';

select cron.schedule(
  'dgp-cloudflare-observability-canary-kick',
  '*/5 * * * *',
  'select orchestration.kick_cloudflare_observability_canary();'
);

select pg_notify('pgrst','reload schema');
 then
    raise exception 'Cloudflare canary worker URL must be an exact HTTPS /api/jobs/worker endpoint'
      using errcode = '22023';
  end if;

  if length(v_secret) < 32 then
    raise exception 'Cloudflare canary worker secret must contain at least 32 characters'
      using errcode = '22023';
  end if;

  select id into v_id from vault.secrets where name = 'DGP_CLOUDFLARE_WORKER_URL' limit 1;
  if v_id is null then
    perform vault.create_secret(v_url, 'DGP_CLOUDFLARE_WORKER_URL', 'DataNexus Cloudflare canary worker endpoint', null);
  else
    perform vault.update_secret(v_id, v_url, 'DGP_CLOUDFLARE_WORKER_URL', 'DataNexus Cloudflare canary worker endpoint', null);
  end if;

  v_id := null;
  select id into v_id from vault.secrets where name = 'DGP_CLOUDFLARE_WORKER_SECRET' limit 1;
  if v_id is null then
    perform vault.create_secret(v_secret, 'DGP_CLOUDFLARE_WORKER_SECRET', 'DataNexus Cloudflare canary bearer credential', null);
  else
    perform vault.update_secret(v_id, v_secret, 'DGP_CLOUDFLARE_WORKER_SECRET', 'DataNexus Cloudflare canary bearer credential', null);
  end if;

  v_id := null;
  select id into v_id from vault.secrets where name = 'DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED' limit 1;
  if v_id is null then
    perform vault.create_secret(case when p_enabled then 'true' else 'false' end, 'DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED', 'DataNexus Cloudflare OBSERVABILITY canary scheduler switch', null);
  else
    perform vault.update_secret(v_id, case when p_enabled then 'true' else 'false' end, 'DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED', 'DataNexus Cloudflare OBSERVABILITY canary scheduler switch', null);
  end if;
end;
$function$;

revoke all on function orchestration.configure_cloudflare_observability_canary(text,text,boolean) from public,anon,authenticated;
grant execute on function orchestration.configure_cloudflare_observability_canary(text,text,boolean) to service_role;

create or replace function orchestration.kick_cloudflare_observability_canary()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, net
as $function$
declare
  worker_secret text;
  worker_url text;
  canary_enabled text;
  request_id bigint;
begin
  select decrypted_secret
    into canary_enabled
    from vault.decrypted_secrets
   where name = 'DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED'
   limit 1;

  if lower(btrim(coalesce(canary_enabled, ''))) <> 'true' then
    return null;
  end if;

  select decrypted_secret
    into worker_secret
    from vault.decrypted_secrets
   where name = 'DGP_CLOUDFLARE_WORKER_SECRET'
   limit 1;

  select decrypted_secret
    into worker_url
    from vault.decrypted_secrets
   where name = 'DGP_CLOUDFLARE_WORKER_URL'
   limit 1;

  if worker_secret is null or btrim(worker_secret) = '' then
    raise exception 'DGP_CLOUDFLARE_WORKER_SECRET is required for Cloudflare canary dispatch';
  end if;

  if worker_url is null or btrim(worker_url) = '' then
    raise exception 'DGP_CLOUDFLARE_WORKER_URL is required for Cloudflare canary dispatch';
  end if;

  worker_url := btrim(worker_url);
  if worker_url !~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?/api/jobs/worker$' then
    raise exception 'DGP_CLOUDFLARE_WORKER_URL must be an exact HTTPS /api/jobs/worker endpoint';
  end if;

  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || worker_secret,
      'Content-Type', 'application/json',
      'User-Agent', 'datanexus-cloudflare-canary-dispatch/1.0'
    ),
    body := jsonb_build_object(
      'mode', 'CLOUDFLARE_OBSERVABILITY_CANARY',
      'source', 'SUPABASE_CANARY_SCHEDULER'
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end;
$function$;

revoke all on function orchestration.kick_cloudflare_observability_canary() from public,anon,authenticated;
grant execute on function orchestration.kick_cloudflare_observability_canary() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'dgp-cloudflare-observability-canary-kick';

select cron.schedule(
  'dgp-cloudflare-observability-canary-kick',
  '*/5 * * * *',
  'select orchestration.kick_cloudflare_observability_canary();'
);

select pg_notify('pgrst','reload schema');
