import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const verifier = path.join(root, 'scripts/verify-synthetic-governance-readiness-fixture.mjs')
const canonical = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260915130000_fix_synthetic_governance_readiness_fixture.sql'),
  'utf8',
)
const runtimeAssertion = fs.readFileSync(
  path.join(root, 'scripts/assert-synthetic-governance-suite.sql'),
  'utf8',
)

function verify(sql) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'synthetic-readiness-'))
  const migration = path.join(directory, 'fixture.sql')
  fs.writeFileSync(migration, sql)
  try {
    return execFileSync(process.execPath, [verifier], {
      env: { ...process.env, SYNTHETIC_READINESS_MIGRATION_PATH: migration },
      encoding: 'utf8',
      stdio: 'pipe',
    })
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

function rejects(sql, expectedMessage) {
  assert.throws(
    () => verify(sql),
    error => {
      assert.match(`${error.stdout}\n${error.stderr}`, expectedMessage)
      return true
    },
  )
}

test('accepts the canonical governed readiness fixture', () => {
  assert.match(verify(canonical), /contract verified/)
})

test('rejects the original invalid JavaScript-style SQL array syntax', () => {
  rejects(
    canonical.replace(
      "jsonb_build_object('include',jsonb_build_array('profiling_validation.synthetic_customers'))",
      "jsonb_build_object('include',['profiling_validation.synthetic_customers'])",
    ),
    /valid PostgreSQL JSON array construction|JavaScript-style array syntax/,
  )
})

test('rejects readiness enforcement bypasses', () => {
  rejects(`${canonical}\nset session_replication_role = replica;`, /trigger enforcement must not be bypassed/)
})

test('rejects drift in the fail-closed readiness contract', () => {
  rejects(
    canonical.replace('Synthetic governed JDBC readiness fixture did not reach READY', 'fixture was not ready'),
    /fixture must fail closed when readiness is not READY/,
  )
})

test('clean replay runtime assertion rejects failed status and any false check', () => {
  assert.match(runtimeAssertion, /status' is distinct from 'PASSED'/)
  assert.match(runtimeAssertion, /bool_and\(value = 'true'::jsonb\)/)
  assert.match(runtimeAssertion, /coalesce\([\s\S]*false[\s\S]*\) is not true/)
})
