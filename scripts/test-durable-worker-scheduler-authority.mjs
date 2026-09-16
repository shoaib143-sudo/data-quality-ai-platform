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
declare worker_secret text; request_id bigint;
begin
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name = 'DGP_DURABLE_WORKER_SECRET';
  select net.http_post(
    url := 'https://data-quality-ai-platform.vercel.app/api/jobs/worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || worker_secret),
    body := jsonb_build_object('mode', 'ADAPTIVE_DISPATCH', 'source', 'JOB_QUEUE_TRIGGER')
  ) into request_id;
  return request_id;
end; $$;
revoke all on function orchestration.kick_durable_worker() from public;
grant execute on function orchestration.kick_durable_worker() to service_role;
select cron.schedule('dgp-durable-worker-kick', '* * * * *', 'select orchestration.kick_durable_worker();');
`

const cleanVercel = { buildCommand: 'pnpm build', regions: ['sin1'] }

function expectFailure(migrationSql, vercelConfig, code) {
  assert.throws(
    () => verifyDurableWorkerSchedulerAuthority({ migrationSql, vercelConfig }),
    (error) => error instanceof Error && error.message === code,
  )
}

test('accepts the governed database scheduler authority', () => {
  const result = verifyDurableWorkerSchedulerAuthority({ migrationSql: validMigration, vercelConfig: cleanVercel })
  assert.equal(result.authority, 'SUPABASE_PG_CRON')
  assert.equal(result.schedule, '* * * * *')
  assert.equal(result.secretName, 'DGP_DURABLE_WORKER_SECRET')
})

test('rejects missing bearer authentication', () => {
  expectFailure(validMigration.replace("'Authorization', 'Bearer ' || worker_secret", "'X-Test', 'unsafe'"), cleanVercel, 'DURABLE_WORKER_BEARER_AUTH_MISSING')
})

test('rejects cadence slower than one minute', () => {
  expectFailure(validMigration.replace("'* * * * *'", "'*/5 * * * *'"), cleanVercel, 'DURABLE_WORKER_ONE_MINUTE_CRON_MISSING')
})

test('rejects a mutable public execute boundary', () => {
  expectFailure(validMigration.replace('revoke all on function orchestration.kick_durable_worker() from public;', ''), cleanVercel, 'DURABLE_WORKER_PUBLIC_EXECUTE_NOT_REVOKED')
})

test('rejects missing Vault secret authority', () => {
  expectFailure(validMigration.replace('vault.decrypted_secrets', 'public.secrets'), cleanVercel, 'DURABLE_WORKER_VAULT_AUTHORITY_MISSING')
})

test('rejects duplicate Vercel worker scheduling', () => {
  expectFailure(validMigration, {
    ...cleanVercel,
    crons: [{ path: '/api/jobs/worker', schedule: '* * * * *' }],
  }, 'DURABLE_WORKER_DUPLICATE_VERCEL_CRON_PRESENT')
})

test('rejects a non-canonical worker destination', () => {
  expectFailure(validMigration.replace('https://data-quality-ai-platform.vercel.app/api/jobs/worker', 'https://example.invalid/api/jobs/worker'), cleanVercel, 'DURABLE_WORKER_CANONICAL_URL_MISSING')
})
