import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migration = fs.readFileSync(
  'supabase/migrations/20261020034500_negative_learning_case_occurrence_rls_policy.sql',
  'utf8',
)

test('negative learning occurrence evidence remains explicitly deny-by-default', () => {
  assert.match(migration, /create policy negative_learning_case_occurrences_authenticated_deny/)
  assert.match(migration, /as restrictive/)
  assert.match(migration, /to authenticated/)
  assert.match(migration, /using \(false\)/)
  assert.match(migration, /revoke all on agent\.negative_learning_case_occurrences/)
  assert.match(migration, /grant select, insert on agent\.negative_learning_case_occurrences\s+to service_role/)
})
