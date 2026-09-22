import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/functions/dgp-postgres-connector/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')

test('PostgreSQL connector keeps health non-sensitive and gates every privileged action', () => {
  const health = source.indexOf('if (body.action === "health")')
  const gate = source.indexOf('if (!serviceRoleAuthorized(request))')
  const credential = source.indexOf('if (body.action === "credential")')
  const catalog = source.indexOf('if (body.action === "catalog")')
  const validate = source.indexOf('if (body.action === "validate")')
  const query = source.indexOf('if (body.action === "query")')
  const lineage = source.indexOf('if (body.action === "lineage")')

  assert.ok(health >= 0)
  assert.ok(gate > health)
  assert.ok(credential > gate)
  assert.ok(catalog > gate)
  assert.ok(validate > gate)
  assert.ok(query > gate)
  assert.ok(lineage > gate)
  assert.match(source, /Connector access denied\./)
})

test('privileged connector auth accepts only configured server secrets with constant-time comparison', () => {
  assert.match(source, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/)
  assert.match(source, /Deno\.env\.get\("SUPABASE_SECRET_KEYS"\)/)
  assert.match(source, /request\.headers\.get\("apikey"\)/)
  assert.match(source, /request\.headers\.get\("authorization"\)/)
  assert.match(source, /expected\.some\(secret => constantTimeEqual\(candidate, secret\)\)/)
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY[^\n]*return reply\(200/)
})

test('modern secret-key service calls bypass platform JWT parsing only for this custom-authenticated connector', () => {
  const block = config.match(/\[functions\.dgp-postgres-connector\][\s\S]*?(?=\n\[functions\.|$)/)?.[0] ?? ''
  assert.match(block, /verify_jwt\s*=\s*false/)
  assert.match(source, /SUPABASE_SECRET_KEYS/)
  assert.match(source, /if \(!serviceRoleAuthorized\(request\)\) return reply\(403/)
})

test('malformed secret-key registry fails closed and does not disable legacy service-role support', () => {
  assert.match(source, /catch \{\s*\/\/ Fail closed\./)
  assert.match(source, /if \(legacy\) expected\.add\(legacy\)/)
  assert.match(source, /return expected\.length > 0/)
})
