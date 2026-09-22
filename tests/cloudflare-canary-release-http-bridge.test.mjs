import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260922122000_cloudflare_canary_release_http_bridge.sql','utf8')
const workflow = fs.readFileSync('.github/workflows/release-governance.yml','utf8')

test('release bridge delegates only to bounded orchestration canary RPCs', () => {
  assert.match(migration, /get_cloudflare_observability_canary_release_status/)
  assert.match(migration, /orchestration\.get_cloudflare_observability_canary_status\(\)/)
  assert.match(migration, /configure_cloudflare_observability_canary_release/)
  assert.match(migration, /orchestration\.configure_cloudflare_observability_canary/)
  assert.doesNotMatch(migration, /execute\s+format|dynamic/i)
})

test('release bridge remains service-role-only', () => {
  assert.match(migration, /revoke all on function public\.get_cloudflare_observability_canary_release_status\(\) from public,anon,authenticated/)
  assert.match(migration, /grant execute on function public\.get_cloudflare_observability_canary_release_status\(\) to service_role/)
  assert.match(migration, /revoke all on function public\.configure_cloudflare_observability_canary_release\(text,text,boolean\) from public,anon,authenticated/)
  assert.match(migration, /grant execute on function public\.configure_cloudflare_observability_canary_release\(text,text,boolean\) to service_role/)
})

test('release workflow uses public bridge and no orchestration profile headers', () => {
  assert.match(workflow, /rpc\/get_cloudflare_observability_canary_release_status/)
  assert.match(workflow, /rpc\/configure_cloudflare_observability_canary_release/)
  assert.doesNotMatch(workflow, /Content-Profile: orchestration/)
  assert.doesNotMatch(workflow, /Accept-Profile: orchestration/)
  assert.doesNotMatch(workflow, /rest\/v1\/rpc\/get_cloudflare_observability_canary_status/)
  assert.doesNotMatch(workflow, /rest\/v1\/rpc\/configure_cloudflare_observability_canary"/)
})
