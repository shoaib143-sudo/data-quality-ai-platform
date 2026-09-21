import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync('.github/workflows/release-governance.yml', 'utf8')
const postActivationSql = fs.readFileSync('supabase/verify_cloudflare_observability_canary_postactivation.sql', 'utf8')

test('readiness operation validates exact SHA and required protected environment inputs', () => {
  assert.match(workflow, /cloudflare-worker-canary-readiness/)
  assert.match(workflow, /Cloudflare worker canary readiness SHA is not reachable from protected main/)
  for (const marker of [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'DATANEXUS_WORKER_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATANEXUS_CLOUDFLARE_WORKER_URL',
  ]) assert.match(workflow, new RegExp(marker))
  assert.match(workflow, /get_cloudflare_observability_canary_status/)
  assert.match(workflow, /body\.enabled!==false/)
  assert.match(workflow, /body\.cron_active!==true/)
  assert.match(workflow, /body\.allowed_job_type!=='OBSERVABILITY'/)
  assert.match(workflow, /body\.scheduler_authority!=='Supabase'/)
  assert.match(workflow, /body\.single_flight_limit!==1/)
})

test('rollback path verifies Supabase scheduler disabled after worker shutdown', () => {
  const start = workflow.indexOf('  disable-cloudflare-worker-canary:')
  const end = workflow.indexOf('  certify-vercel-production:', start)
  assert.ok(start >= 0 && end > start)
  const rollback = workflow.slice(start, end)
  const workerBoundary = rollback.indexOf('Verify disabled execution boundary')
  const schedulerBoundary = rollback.indexOf('Verify Supabase canary scheduler disabled')
  assert.ok(workerBoundary >= 0)
  assert.ok(schedulerBoundary > workerBoundary)
  assert.match(rollback, /body\.enabled!==false/)
  assert.match(rollback, /body\.cron_active!==true/)
})

test('post-activation SQL requires enabled runtime, Supabase scheduler authority and single-flight', () => {
  assert.match(postActivationSql, /get_cloudflare_observability_canary_status/)
  assert.match(postActivationSql, /Cloudflare canary is not enabled/)
  assert.match(postActivationSql, /Cloudflare canary runtime configuration is incomplete/)
  assert.match(postActivationSql, /Cloudflare canary scheduler is not active at expected cadence/)
  assert.match(postActivationSql, /Cloudflare canary single-flight violated/)
  assert.match(postActivationSql, /cloudflare-observability-canary:%/)
  assert.match(postActivationSql, /status','PASS'/)
})
