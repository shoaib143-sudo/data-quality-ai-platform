import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const control = fs.readFileSync(new URL('../lib/storage/r2-cors.ts', import.meta.url), 'utf8')
const route = fs.readFileSync(new URL('../app/api/internal/storage/configure-r2-cors/route.ts', import.meta.url), 'utf8')
const desired = fs.readFileSync(new URL('../infra/cloudflare/r2-cors-policy.json', import.meta.url), 'utf8')

test('R2 CORS control signs the supported S3 bucket cors subresource', () => {
  assert.match(control, /AWS4-HMAC-SHA256/)
  assert.match(control, /SERVICE = 's3'/)
  assert.match(control, /REGION = 'auto'/)
  assert.match(control, /canonicalQuery = 'cors='/)
  assert.match(control, /signedCorsRequest\('PUT'/)
  assert.match(control, /signedCorsRequest\('GET'/)
  assert.match(control, /application\/xml/)
  assert.match(control, /CORSConfiguration/)
  assert.match(control, /x-amz-content-sha256/)
  assert.match(control, /R2_ENDPOINT does not match the configured R2 account/)
})

test('R2 CORS control uses the same exact-origin least-privilege desired state as infra config', () => {
  for (const origin of [
    'https://data-quality-ai-platform.vercel.app',
    'https://data-quality-ai-platform-git-r2-prereq-ha-4e83b5-shoaib143-sudo.vercel.app',
  ]) {
    assert.match(control, new RegExp(origin.replaceAll('.', '\\.')))
    assert.match(desired, new RegExp(origin.replaceAll('.', '\\.')))
  }
  assert.match(control, /allowedMethods: \['GET', 'PUT', 'HEAD'\]/)
  assert.doesNotMatch(control, /allowedOrigins:[^\n]*\*/)
})

test('R2 CORS mutation endpoint is internal-authenticated and separately approved', () => {
  assert.match(route, /await requireInternalAutomation\\(request\\)/)
  assert.match(route, /R2_INFRA_MUTATIONS_APPROVED/)
  assert.match(route, /status: 403/)
  assert.match(route, /applyDataNexusR2CorsPolicy/)
  assert.match(route, /matchesDesiredPolicy/)
  assert.match(route, /wildcardOriginDetected/)
  assert.doesNotMatch(route, /request\.json\(/)
})
