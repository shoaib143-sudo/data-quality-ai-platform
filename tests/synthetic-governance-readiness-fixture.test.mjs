import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migrations = [
  'supabase/migrations/20260915130000_fix_synthetic_governance_readiness_fixture.sql',
  'supabase/migrations/20260915131000_reconcile_synthetic_governance_readiness_fixture.sql',
].map(path => fs.readFileSync(path, 'utf8'))
const runtimeAssertion = fs.readFileSync('scripts/assert-synthetic-governance-suite.sql', 'utf8')
const hashHardening = fs.readFileSync(
  'supabase/migrations/20260915185000_harden_synthetic_readiness_hash_resolution.sql',
  'utf8',
)

function validateScopeRules(sql) {
  return sql.includes("jsonb_build_object('include',jsonb_build_array('profiling_validation.synthetic_customers'))")
    && !sql.includes("jsonb_build_object('include',['profiling_validation.synthetic_customers'])")
}

test('both readiness migrations use valid PostgreSQL JSON array construction', () => {
  for (const sql of migrations) assert.equal(validateScopeRules(sql), true)
})

test('rejects the original JavaScript-style SQL array regression', () => {
  const regressed = migrations[0].replace(
    "jsonb_build_object('include',jsonb_build_array('profiling_validation.synthetic_customers'))",
    "jsonb_build_object('include',['profiling_validation.synthetic_customers'])",
  )
  assert.equal(validateScopeRules(regressed), false)
})

test('runtime assertion fails closed on failed status, empty checks, and false checks', () => {
  assert.match(runtimeAssertion, /insert into auth\.users/)
  assert.match(runtimeAssertion, /insert into app\.organization_members/)
  assert.match(runtimeAssertion, /'OWNER'/)
  assert.match(runtimeAssertion, /status' is distinct from 'PASSED'/)
  assert.match(runtimeAssertion, /bool_and\(value = 'true'::jsonb\)/)
  assert.match(runtimeAssertion, /coalesce\([\s\S]*false[\s\S]*\) is not true/)
  assert.match(runtimeAssertion, /rollback;/)
})

test('hash hardening preserves restricted search path and ACLs', () => {
  assert.match(hashHardening, /pg_catalog\.encode\(extensions\.digest\(/)
  assert.match(hashHardening, /set search_path = pg_catalog, governance, profiling, catalog, orchestration, app/)
  assert.match(hashHardening, /revoke execute[\s\S]*public, anon, authenticated/)
  assert.match(hashHardening, /grant execute[\s\S]*service_role/)
})
