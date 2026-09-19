import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workflow = fs.readFileSync(new URL('../.github/workflows/release-governance.yml', import.meta.url), 'utf8')
const certification = workflow.slice(workflow.indexOf('  certify-vercel-production:'))

test('Vercel production certification is manual and exact-SHA only', () => {
  assert.match(workflow, /- vercel-production-certify/)
  assert.match(certification, /inputs\.operation == 'vercel-production-certify'/)
  assert.match(certification, /environment: production/)
  assert.match(certification, /EXPECTED_SHA: \$\{\{ inputs\.commit_sha \}\}/)
  assert.match(certification, /\^\[0-9a-f\]\{40\}\$/)
  assert.doesNotMatch(certification, /vercel deploy|vercel --prod|VERCEL_TOKEN/)
})

test('Vercel production certification binds the official production hostname', () => {
  assert.match(certification, /DATANEXUS_VERCEL_PRODUCTION_URL: https:\/\/data-quality-ai-platform\.vercel\.app/)
  assert.doesNotMatch(certification, /\$\{\{ vars\.DATANEXUS_VERCEL_PRODUCTION_URL \}\}/)
})

test('Vercel production certification verifies liveness and exact deployed identity', () => {
  assert.match(certification, /\/api\/health\/live/)
  assert.match(certification, /body\.status !== 'ALIVE'/)
  assert.match(certification, /\/api\/build-info/)
  assert.match(certification, /body\.commitSha !== expected/)
  assert.match(certification, /body\.environment !== 'production'/)
  assert.match(certification, /body\.platform !== 'vercel'/)
})

test('Vercel production readiness is fail-closed rather than cosmetically accepted', () => {
  assert.match(certification, /curl --fail-with-body/)
  assert.match(certification, /\/api\/health\/ready/)
  assert.match(certification, /body\.status !== 'READY'/)
})

test('Vercel production certification proves the governed R2 route exists without bypassing auth', () => {
  assert.match(certification, /\/api\/internal\/storage\/certify-r2/)
  assert.match(certification, /test "\$code" = "401"/)
  assert.match(certification, /body\.error !== 'Unauthorized\.'/)
  assert.doesNotMatch(certification, /CRON_SECRET|OIDC_TOKEN|Authorization: Bearer/)
})
