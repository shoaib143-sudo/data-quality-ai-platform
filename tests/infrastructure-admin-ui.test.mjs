import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/admin/infrastructure/page.tsx', 'utf8')
const admin = fs.readFileSync('app/admin/page.tsx', 'utf8')

test('infrastructure observability is discoverable from administration', () => {
  assert.match(admin, /href="\/admin\/infrastructure"/)
  assert.match(admin, />Infrastructure<\/Link>/)
  assert.match(page, /href="\/admin"/)
  assert.match(page, /href="\/home"/)
})

test('infrastructure page requires administrator membership and scopes storage to authorized projects', () => {
  assert.match(page, /requireUser\(\)/)
  assert.match(page, /organization_members/)
  assert.match(page, /\.in\('role', \['OWNER', 'ADMIN'\]\)/)
  assert.match(page, /\.in\('project_id', projectIds\)/)
  assert.match(page, /OWNER or ADMIN membership is required/)
})

test('all infrastructure status modules expose clear operator-facing state', () => {
  for (const id of ['runtime-status-heading', 'storage-cutover-heading', 'cloudflare-worker-canary-heading', 'architecture-boundary-heading']) assert.match(page, new RegExp(`aria-labelledby=\\"${id}\\"`))
  for (const label of [
    'Primary runtime',
    'Supabase objects',
    'R2 objects',
    'R2 runtime config',
    'Default provider',
    'Bulk provider',
    'Production R2 cutover',
    '1 job / cycle',
    'OBSERVABILITY',
    'Kill switch',
    'Scheduler authority',
    'Claim limit',
    'Allowed workload',
    'Cloudflare worker canary',
    'Architecture boundary',
  ]) assert.ok(page.includes(label), `missing infrastructure UX label: ${label}`)
})

test('R2 secrets are checked server-side but never rendered', () => {
  for (const secret of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) assert.match(page, new RegExp(secret))
  assert.match(page, /Credential values are intentionally hidden/)
  assert.doesNotMatch(page, /process\.env\[name\][^\n]*\}/)
  assert.doesNotMatch(page, /NEXT_PUBLIC_R2_/)
})

test('read-only infrastructure page does not expose destructive CTAs', () => {
  assert.doesNotMatch(page, /<button/)
  assert.doesNotMatch(page, /fetch\(/)
  assert.doesNotMatch(page, /deleteObject|migrate-to-r2|reference-cutover/)
})


test('Cloudflare canary policy remains read-only and communicates bounded authority', () => {
  assert.match(page, /Cloudflare worker canary/)
  assert.match(page, /OBSERVABILITY/)
  assert.match(page, /1 job \/ cycle/)
  assert.match(page, /Scheduler authority/)
  assert.match(page, /Supabase/)
  assert.match(page, /Default off; owner-approved activation only/)
  assert.doesNotMatch(page, /Enable worker|Activate canary|Disable worker/)
})


test('infrastructure page loads live canary status without rendering secrets', () => {
  assert.match(page, /get_cloudflare_observability_canary_status/)
  assert.match(page, /canaryStatus\.enabled/)
  assert.match(page, /canaryStatus\.runtime_configured/)
  assert.match(page, /canaryStatus\.cron_active/)
  assert.match(page, /canaryStatus\.queued/)
  assert.match(page, /canaryStatus\.running/)
  assert.match(page, /canaryStatus\.succeeded/)
  assert.match(page, /canaryStatus\.failed/)
  assert.doesNotMatch(page, /DGP_CLOUDFLARE_WORKER_SECRET/)
  assert.match(page, /Credential values remain hidden/)
})
