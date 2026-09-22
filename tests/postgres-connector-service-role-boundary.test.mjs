import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/functions/dgp-postgres-connector/index.ts', 'utf8')

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

test('privileged connector auth compares the bearer value to the server-side service-role secret', () => {
  assert.match(source, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/)
  assert.match(source, /request\.headers\.get\("authorization"\)/)
  assert.match(source, /constantTimeEqual\(supplied, expected\)/)
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY[^\n]*return reply\(200/)
})
