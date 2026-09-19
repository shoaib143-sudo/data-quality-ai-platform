-- Provider-neutral durable-worker dispatch authority.
-- Replaces the Vercel-specific worker destination while preserving the single
-- Supabase pg_cron scheduler authority and bearer-authenticated worker contract.

create or replace function orchestration.kick_durable_worker()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, net
as $$
declare
  worker_secret text;
  worker_url text;
  request_id bigint;
begin
  select decrypted_secret
    into worker_secret
    from vault.decrypted_secrets
   where name = 'DGP_DURABLE_WORKER_SECRET'
   limit 1;

  select decrypted_secret
    into worker_url
    from vault.decrypted_secrets
   where name = 'DGP_DURABLE_WORKER_URL'
   limit 1;

  if worker_secret is null or btrim(worker_secret) = '' then
    raise exception 'DGP_DURABLE_WORKER_SECRET is required for durable worker dispatch';
  end if;

  if worker_url is null or btrim(worker_url) = '' then
    raise exception 'DGP_DURABLE_WORKER_URL is required for durable worker dispatch';
  end if;

  worker_url := btrim(worker_url);
  if worker_url !~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?/api/jobs/worker$' then
    raise exception 'DGP_DURABLE_WORKER_URL must be an exact HTTPS /api/jobs/worker endpoint';
  end if;

  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || worker_secret,
      'Content-Type', 'application/json',
      'User-Agent', 'datanexus-db-dispatch/3.0'
    ),
    body := jsonb_build_object(
      'mode', 'ADAPTIVE_DISPATCH',
      'source', 'JOB_QUEUE_TRIGGER'
    ),
    timeout_milliseconds := 10000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function orchestration.kick_durable_worker() from public;
grant execute on function orchestration.kick_durable_worker() to service_role;
