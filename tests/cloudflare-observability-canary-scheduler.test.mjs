import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260921153000_cloudflare_observability_canary_scheduler.sql', 'utf8')
const release = fs.readFileSync('.github/workflows/release-governance.yml', 'utf8')

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
  assert.match(migration, /Cloudflare canary worker URL must be an exact HTTPS \/api\/jobs\/worker endpoint/)
  assert.match(migration, /DGP_CLOUDFLARE_WORKER_URL must be an exact HTTPS \/api\/jobs\/worker endpoint/)
  assert.doesNotMatch(migration, /data-quality-ai-platform\.vercel\.app/)
})

test('canary scheduler remains service-role only and low cadence', () => {
  assert.match(migration, /revoke all on function orchestration\.kick_cloudflare_observability_canary\(\) from public,anon,authenticated/i)
  assert.match(migration, /grant execute on function orchestration\.kick_cloudflare_observability_canary\(\) to service_role/i)
  assert.match(migration, /dgp-cloudflare-observability-canary-kick/)
  assert.match(migration, /'\*\/5 \* \* \* \*'/)
})


test('configuration RPC is bounded to fixed canary Vault keys and service role', () => {
  assert.match(migration, /configure_cloudflare_observability_canary/)
  for (const name of [
    'DGP_CLOUDFLARE_WORKER_URL',
    'DGP_CLOUDFLARE_WORKER_SECRET',
    'DGP_CLOUDFLARE_OBSERVABILITY_CANARY_ENABLED',
  ]) assert.match(migration, new RegExp(name))
  assert.match(migration, /length\(v_secret\) < 32/)
  assert.match(migration, /revoke all on function orchestration\.configure_cloudflare_observability_canary\(text,text,boolean\) from public,anon,authenticated/i)
  assert.match(migration, /grant execute on function orchestration\.configure_cloudflare_observability_canary\(text,text,boolean\) to service_role/i)
})

test('release workflow keeps scheduler disabled until live canary verification succeeds', () => {
  const falseIndex = release.indexOf('p_enabled:false')
  const verifyIndex = release.indexOf('Verify exact SHA and narrow execution boundary')
  const trueIndex = release.indexOf('p_enabled:true')
  assert.ok(falseIndex >= 0)
  assert.ok(verifyIndex > falseIndex)
  assert.ok(trueIndex > verifyIndex)
  assert.match(release, /Enable Supabase canary scheduler only after live verification/)
  assert.match(release, /Content-Profile: orchestration/)
  assert.match(release, /Accept-Profile: orchestration/)
})


test('rollback disables scheduler before worker redeploy and verifies 503', () => {
  const start = release.indexOf('  disable-cloudflare-worker-canary:')
  const end = release.indexOf('  certify-vercel-production:', start)
  assert.ok(start >= 0 && end > start)
  const rollback = release.slice(start, end)
  const disableIndex = rollback.indexOf('p_enabled:false')
  const redeployIndex = rollback.indexOf('Redeploy worker with execution disabled')
  assert.ok(disableIndex >= 0)
  assert.ok(redeployIndex > disableIndex)
  assert.match(rollback, /DATANEXUS_WORKER_EXECUTION_ENABLED:false/)
  assert.match(rollback, /test "\$disabled_code" = "503"/)
  assert.match(rollback, /cloudflare-worker-canary-disable/)
})


test('post-activation verification proves live Supabase canary state', () => {
  const start = release.indexOf('  enable-cloudflare-worker-canary:')
  const end = release.indexOf('  disable-cloudflare-worker-canary:', start)
  assert.ok(start >= 0 && end > start)
  const enable = release.slice(start, end)
  assert.match(enable, /Verify enabled Supabase canary state/)
  assert.match(enable, /get_cloudflare_observability_canary_status/)
  assert.match(enable, /body\.enabled!==true/)
  assert.match(enable, /body\.runtime_configured!==true/)
  assert.match(enable, /body\.cron_active!==true/)
  assert.match(enable, /body\.cron_schedule!=='\*\/5 \* \* \* \*'/)
  assert.match(enable, /body\.allowed_job_type!=='OBSERVABILITY'/)
  assert.match(enable, /body\.scheduler_authority!=='Supabase'/)
  assert.match(enable, /body\.single_flight_limit!==1/)
})

test('activation failure cleanup disables scheduler and worker execution', () => {
  const start = release.indexOf('  enable-cloudflare-worker-canary:')
  const end = release.indexOf('  disable-cloudflare-worker-canary:', start)
  assert.ok(start >= 0 && end > start)
  const enable = release.slice(start, end)
  const verify = enable.indexOf('Verify enabled Supabase canary state')
  const cleanup = enable.indexOf('Fail closed after activation error')
  assert.ok(verify >= 0)
  assert.ok(cleanup > verify)
  assert.match(enable, /if: \$\{\{ failure\(\) \}\}/)
  assert.match(enable, /p_enabled:false/)
  assert.match(enable, /DATANEXUS_WORKER_EXECUTION_ENABLED:false/)
  assert.match(enable, /github-worker-canary-failclosed/)
})
