import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260921153000_cloudflare_observability_canary_scheduler.sql', 'utf8')

test('canary scheduler is fail-closed unless explicitly enabled', () => {
  assert.match(migration, /DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED/)
  assert.match(migration, /lower\(btrim\(coalesce\(canary_enabled, ''\)\)\) <> 'true'/)
  assert.match(migration, /return null/)
})

test('canary scheduler dispatches only the narrow Cloudflare mode', () => {
  assert.match(migration, /CLOUDFLARE_OBSERVABILITY_CANARY/)
  assert.match(migration, /SUPABASE_CANARY_SCHEDULER/)
  assert.doesNotMatch(migration, /ADAPTIVE_DISPATCH/)
})

test('canary scheduler requires governed secret and exact HTTPS worker endpoint', () => {
  assert.match(migration, /DGP_CLOUDFLARE_WORKER_SECRET/)
  assert.doesNotMatch(migration, /DGP_DURABLE_WORKER_SECRET/)
  assert.match(migration, /DGP_CLOUDFLARE_WORKER_URL/)
  assert.match(migration, /\^https:\/\/[A-Za-z0-9.-]+\(\?:\:\[0-9\]\+\)\?\/api\/jobs\/worker\$/)
  assert.doesNotMatch(migration, /data-quality-ai-platform\.vercel\.app/)
})

test('canary scheduler remains service-role only and low cadence', () => {
  assert.match(migration, /revoke all on function orchestration\.kick_cloudflare_observability_canary\(\) from public,anon,authenticated/i)
  assert.match(migration, /grant execute on function orchestration\.kick_cloudflare_observability_canary\(\) to service_role/i)
  assert.match(migration, /dgp-cloudflare-observability-canary-kick/)
  assert.match(migration, /'\*\/5 \* \* \* \*'/)
})
