import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyDurableWorkerSchedulerAuthority } from '../lib/recovery/durable-worker-scheduler-authority.mjs'

const validMigration = `
create or replace function orchestration.kick_durable_worker()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, net
as $$
declare worker_secret text; worker_url text; request_id bigint;
begin
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name = 'DGP_DURABLE_WORKER_SECRET';
  select decrypted_secret into worker_url from vault.decrypted_secrets where name = 'DGP_DURABLE_WORKER_URL';
  if worker_url !~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?/api/jobs/worker$' then raise exception 'bad worker url'; end if;
  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || worker_secret),
    body := jsonb_build_object('mode', 'ADAPTIVE_DISPATCH', 'source', 'JOB_QUEUE_TRIGGER')
  ) into request_id;
  return request_id;
end; $$;
revoke all on function orchestration.kick_durable_worker() from public;
grant execute on function orchestration.kick_durable_worker() to service_role;
`

const cleanVercel = { buildCommand: 'pnpm build', regions: ['sin1'] }

function expectFailure(migrationSql, vercelConfig, code) {
  assert.throws(
    () => verifyDurableWorkerSchedulerAuthority({ migrationSql, vercelConfig }),
    (error) => error instanceof Error && error.message === code,
  )
}

test('accepts the governed database scheduler authority with provider-neutral worker URL', () => {
  const result = verifyDurableWorkerSchedulerAuthority({ migrationSql: validMigration, vercelConfig: cleanVercel })
  assert.equal(result.authority, 'SUPABASE_PG_CRON')
  assert.equal(result.schedule, '* * * * *')
  assert.equal(result.secretName, 'DGP_DURABLE_WORKER_SECRET')
  assert.equal(result.workerUrlSecretName, 'DGP_DURABLE_WORKER_URL')
})

test('rejects missing bearer authentication', () => {
  expectFailure(validMigration.replace("'Authorization', 'Bearer ' || worker_secret", "'X-Test', 'unsafe'"), cleanVercel, 'DURABLE_WORKER_BEARER_AUTH_MISSING')
})

test('rejects a mutable public execute boundary', () => {
  expectFailure(validMigration.replace('revoke all on function orchestration.kick_durable_worker() from public;', ''), cleanVercel, 'DURABLE_WORKER_PUBLIC_EXECUTE_NOT_REVOKED')
})

test('rejects missing Vault secret authority', () => {
  expectFailure(validMigration.replaceAll('vault.decrypted_secrets', 'public.secrets'), cleanVercel, 'DURABLE_WORKER_VAULT_AUTHORITY_MISSING')
})

test('rejects missing governed worker URL secret', () => {
  expectFailure(validMigration.replace("DGP_DURABLE_WORKER_URL", "DGP_WORKER_URL"), cleanVercel, 'DURABLE_WORKER_URL_SECRET_NAME_MISSING')
})

test('rejects direct provider-specific worker destination', () => {
  expectFailure(validMigration.replace('url := worker_url', "url := 'https://data-quality-ai-platform.vercel.app/api/jobs/worker'"), cleanVercel, 'DURABLE_WORKER_VAULT_URL_NOT_USED')
})

test('rejects duplicate Vercel worker scheduling', () => {
  expectFailure(validMigration, {
    ...cleanVercel,
    crons: [{ path: '/api/jobs/worker', schedule: '* * * * *' }],
  }, 'DURABLE_WORKER_DUPLICATE_VERCEL_CRON_PRESENT')
})
