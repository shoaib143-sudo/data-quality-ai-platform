import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/internal/storage/r2-smoke/route.ts', import.meta.url), 'utf8')

test('R2 smoke probe requires explicit probe approval, exact preview branch, and internal bearer auth', () => {
  assert.match(route, /R2_SMOKE_PROBE_APPROVED/)
  assert.match(route, /R2_SMOKE_ALLOWED_REF/)
  assert.match(route, /VERCEL_ENV === 'preview'/)
  assert.match(route, /requireInternalBearer\(request\)/)
  assert.match(route, /R2 smoke probe is not enabled/)
  assert.match(route, /status: 404/)
  assert.match(route, /status: 401/)
})

test('R2 smoke probe remains bounded to assurance objects and cleans both server and browser probes', () => {
  assert.match(route, /_assurance\//)
  assert.match(route, /storage\.deleteObject\(reference\)/)
  assert.match(route, /storage\.deleteObject\(browserReference\)/)
  assert.match(route, /Best-effort cleanup only/)
})
