import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')
const service = fs.readFileSync('lib/orchestration/worker-service.ts', 'utf8')
const route = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const router = fs.readFileSync('infra/cloudflare/worker-runtime/src/router.ts', 'utf8')
const config = JSON.parse(fs.readFileSync('infra/cloudflare/worker-runtime/wrangler.jsonc', 'utf8'))
const migration = fs.readFileSync('supabase/migrations/20260921124500_cloudflare_observability_canary_claim.sql', 'utf8')
const rollout = fs.readFileSync('.github/workflows/cloudflare-worker-observability-canary.yml', 'utf8')
const release = fs.readFileSync('.github/workflows/release-governance.yml', 'utf8')

test('Cloudflare execution remains disabled by default with an explicit OBSERVABILITY canary allowlist', () => {
  assert.equal(config.vars.DATANEXUS_WORKER_EXECUTION_ENABLED, 'false')
  assert.equal(config.vars.DATANEXUS_WORKER_CANARY_JOB_TYPE, 'OBSERVABILITY')
  assert.match(router, /DATANEXUS_WORKER_CANARY_JOB_TYPE !== 'OBSERVABILITY'/)
  assert.match(router, /CLOUDFLARE_OBSERVABILITY_CANARY/)
})

test('ingress rejects general adaptive dispatch after canary execution is enabled', () => {
  assert.match(router, /Cloudflare worker execution is restricted to the observability canary mode/)
  assert.match(router, /body\.mode !== 'CLOUDFLARE_OBSERVABILITY_CANARY'/)
  assert.match(router, /status: 403/)
})

test('portable worker canary cycle claims at most one OBSERVABILITY job', () => {
  assert.match(service, /runCloudflareObservabilityCanaryCycle/)
  assert.match(service, /claimDurableJobsByType\([^\n]+OBSERVABILITY[^\n]+1\)/)
  assert.match(queue, /jobType !== 'OBSERVABILITY'/)
  assert.match(queue, /rpc\('claim_jobs_by_type'/)
  assert.match(queue, /Math\.min\(Math\.floor\(limit\), 4\)/)
})

test('database claim authority only allows OBSERVABILITY and preserves fencing', () => {
  assert.match(migration, /v_type <> 'OBSERVABILITY'/)
  assert.match(migration, /Unsupported Cloudflare canary job type/)
  assert.match(migration, /for update of q skip locked/i)
  assert.match(migration, /lease_owner = p_worker/)
  assert.match(migration, /lease_expires_at > now\(\)/)
  assert.match(migration, /job_dependencies/)
  assert.match(migration, /max_concurrent_jobs/)
  assert.match(migration, /service_role/)
  assert.match(migration, /revoke execute .* public,anon,authenticated/i)
})

test('canary activation is separately owner-approved and remains reversible', () => {
  assert.match(rollout, /Cloudflare Worker Observability Canary/)
  assert.match(rollout, /confirm_worker_execution/)
  assert.match(rollout, /inputs\.confirm_worker_execution == true/)
  assert.match(rollout, /DATANEXUS_WORKER_EXECUTION_ENABLED:true/)
  assert.match(rollout, /DATANEXUS_WORKER_CANARY_JOB_TYPE:OBSERVABILITY/)
  assert.match(release, /DATANEXUS_WORKER_EXECUTION_ENABLED:false/)
})

test('enabled canary requires privileged secrets and verifies unauthorized and over-broad modes fail closed', () => {
  assert.match(rollout, /secrets\.DATANEXUS_WORKER_SECRET/)
  assert.match(rollout, /secrets\.SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(rollout, /test "\$unauthorized_code" = "403"/)
  assert.match(rollout, /test "\$forbidden_code" = "403"/)
  assert.match(rollout, /body\.jobType!=='OBSERVABILITY'/)
  assert.match(rollout, /body\.claimed<0\|\|body\.claimed>1/)
})
