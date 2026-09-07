create table if not exists orchestration.worker_dispatch_state (
  singleton boolean primary key default true check (singleton),
  last_kicked_at timestamptz not null default '-infinity'::timestamptz,
  last_request_id bigint,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into orchestration.worker_dispatch_state (singleton)
values (true)
on conflict (singleton) do nothing;

alter table orchestration.worker_dispatch_state enable row level security;
revoke all on table orchestration.worker_dispatch_state from public, anon, authenticated;

create or replace function orchestration.kick_durable_worker()
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog', 'vault', 'net'
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'DGP_DURABLE_WORKER_SECRET'
  limit 1;

  if v_secret is null then
    raise exception 'Durable worker secret is unavailable';
  end if;

  select net.http_post(
    url := 'https://data-quality-ai-platform.vercel.app/api/jobs/worker',
    body := jsonb_build_object(
      'mode', 'ADAPTIVE_DISPATCH',
      'source', 'JOB_QUEUE_TRIGGER'
    ),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json',
      'User-Agent', 'datanexus-db-dispatch/2.0'
    ),
    timeout_milliseconds := 10000
  ) into v_request_id;

  return v_request_id;
end;
$$;

comment on function orchestration.kick_durable_worker() is
  'Asynchronously wakes the lightweight adaptive durable-job worker. Cron remains the recovery path.';

create or replace function orchestration.signal_durable_worker()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'orchestration'
as $$
declare
  v_claimed boolean := false;
  v_request_id bigint;
begin
  if new.status <> 'QUEUED' or new.available_at > clock_timestamp() + interval '1 second' then
    return new;
  end if;

  update orchestration.worker_dispatch_state
     set last_kicked_at = clock_timestamp(),
         last_error = null,
         updated_at = clock_timestamp()
   where singleton = true
     and last_kicked_at <= clock_timestamp() - interval '750 milliseconds'
  returning true into v_claimed;

  if coalesce(v_claimed, false) then
    begin
      v_request_id := orchestration.kick_durable_worker();
      update orchestration.worker_dispatch_state
         set last_request_id = v_request_id,
             updated_at = clock_timestamp()
       where singleton = true;
    exception when others then
      update orchestration.worker_dispatch_state
         set last_error = left(sqlerrm, 1000),
             updated_at = clock_timestamp()
       where singleton = true;
      -- A wake-up failure must never roll back the durable queue insert.
    end;
  end if;

  return new;
end;
$$;

revoke all on function orchestration.signal_durable_worker() from public, anon, authenticated;

comment on function orchestration.signal_durable_worker() is
  'Debounces event-driven worker wake-ups for immediately available durable jobs. Network failures are captured without affecting queue durability.';

drop trigger if exists trg_job_queue_signal_worker on orchestration.job_queue;
create trigger trg_job_queue_signal_worker
after insert on orchestration.job_queue
for each row
execute function orchestration.signal_durable_worker();

comment on trigger trg_job_queue_signal_worker on orchestration.job_queue is
  'Wakes the adaptive worker after immediately runnable jobs enter the durable queue; minute cron is recovery only.';
