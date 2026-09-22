import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/functions/dgp-postgres-connector/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const probeMigration = readFileSync('supabase/migrations/20260922170000_postgres_connector_service_role_probe.sql', 'utf8')

test('PostgreSQL connector keeps health non-sensitive and gates every privileged action', () => {
  const health = source.indexOf('if (body.action === "health")')
  const gate = source.indexOf('if (!(await serviceRoleAuthorized(request)))')
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
  assert.match(source, /if \(!\(await serviceRoleAuthorized\(request\)\)\) return reply\(403/)
})

test('malformed secret-key registry fails closed and does not disable legacy service-role support', () => {
  assert.match(source, /catch \{\s*\/\/ Fail closed\./)
  assert.match(source, /if \(legacy\) expected\.add\(legacy\)/)
  assert.match(source, /if \(localMatch\) return true/)
  assert.match(source, /return await serviceRoleApiKeyAuthorized\(apiKey\)/)
})


test('service-role fallback validates apikey authority through a dedicated public RPC', () => {
  assert.match(source, /async function serviceRoleApiKeyAuthorized\(apiKey: string\)/)
  assert.match(source, /\/rest\/v1\/rpc\/verify_dgp_service_role_key/)
  assert.match(source, /"apikey": apiKey/)
  assert.match(source, /"authorization": "Bearer " \+ apiKey/)
  assert.match(source, /if \(!response\.ok\) return false/)
  assert.match(source, /return payload === true/)
})

test('service-role probe is read-only and executable only by service_role', () => {
  assert.match(probeMigration, /create or replace function public\.verify_dgp_service_role_key\(\)/i)
  assert.match(probeMigration, /select true;/i)
  assert.match(probeMigration, /revoke all on function public\.verify_dgp_service_role_key\(\) from public;/i)
  assert.match(probeMigration, /revoke all on function public\.verify_dgp_service_role_key\(\) from anon;/i)
  assert.match(probeMigration, /revoke all on function public\.verify_dgp_service_role_key\(\) from authenticated;/i)
  assert.match(probeMigration, /grant execute on function public\.verify_dgp_service_role_key\(\) to service_role;/i)
})

test('service-role fallback never forwards request bearer identity and fails closed on probe errors', () => {
  const start = source.indexOf('async function serviceRoleApiKeyAuthorized')
  const end = source.indexOf('async function serviceRoleAuthorized', start)
  const helper = source.slice(start, end)
  assert.match(helper, /"apikey": apiKey/)
  assert.doesNotMatch(helper, /request\.headers/)
  assert.match(helper, /catch \{\s*return false/)
})
