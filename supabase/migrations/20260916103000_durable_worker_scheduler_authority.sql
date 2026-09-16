-- Governed durable-worker scheduling authority.
-- The database scheduler is the authoritative one-minute trigger for the durable worker.
-- Vercel cron is intentionally not authoritative because the connected Vercel plan cannot
-- represent the required one-minute cadence. The worker endpoint remains authenticated.

create schema if not exists orchestration;

create or replace function orchestration.kick_durable_worker()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, net
as $$
declare
  worker_secret text;
  request_id bigint;
begin
  select decrypted_secret
    into worker_secret
    from vault.decrypted_secrets
   where name = 'DGP_DURABLE_WORKER_SECRET'
   limit 1;

  if worker_secret is null or btrim(worker_secret) = '' then
    raise exception 'DGP_DURABLE_WORKER_SECRET is required for durable worker dispatch';
  end if;

  select net.http_post(
    url := 'https://data-quality-ai-platform.vercel.app/api/jobs/worker',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || worker_secret,
      'Content-Type', 'application/json',
      'User-Agent', 'datanexus-db-dispatch/2.0'
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

select cron.schedule(
  'dgp-durable-worker-kick',
  '* * * * *',
  'select orchestration.kick_durable_worker();'
);
