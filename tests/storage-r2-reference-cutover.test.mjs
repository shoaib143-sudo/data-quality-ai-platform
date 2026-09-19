import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/internal/storage/reference-cutover/route.ts', import.meta.url), 'utf8')

test('reference cutover is internally authenticated and separately approval gated', () => {
  assert.match(route, /await requireInternalAutomation\(request\)/)
  assert.match(route, /STORAGE_R2_REFERENCE_CUTOVER_APPROVED/)
  assert.match(route, /STORAGE_R2_REFERENCE_ROLLBACK_APPROVED/)
  assert.match(route, /mode === 'apply'/)
  assert.match(route, /mode === 'rollback'/)
  assert.match(route, /dry-run-rollback/)
})

test('reference cutover is bounded and non-destructive', () => {
  assert.match(route, /MAX_BATCH = 50/)
  assert.match(route, /STORAGE_REFERENCE_CUTOVER_MAX_VERIFY_BYTES/)
  assert.match(route, /HARD_MAX_VERIFY_BYTES/)
  assert.match(route, /destructiveActions: 0/)
  assert.match(route, /sourceObjectsDeleted: 0/)
  assert.match(route, /targetObjectsDeleted: 0/)
  assert.doesNotMatch(route, /deleteObject/)
})

test('reference cutover requires verified migration targets and live byte parity', () => {
  assert.match(route, /owner_type', 'MIGRATION_COPY'/)
  assert.match(route, /\.eq\('state', 'READY'\)/)
  assert.match(route, /digestLive\(source/)
  assert.match(route, /digestLive\(target/)
  assert.match(route, /sha256/)
  assert.match(route, /SOURCE_NO_LONGER_MATCHES_MIGRATION_TARGET/)
  assert.match(route, /LIVE_SOURCE_TARGET_MISMATCH/)
  assert.match(route, /target\.checksum_algorithm !== 'sha256'/)
})

test('reference switch is compare-and-set and rollback restores only the verified Supabase source', () => {
  assert.match(route, /\.eq\('storage_object_id', expectedCurrentId\)/)
  assert.match(route, /SKIPPED_CONCURRENT_CHANGE/)
  assert.match(route, /ROLLED_BACK_TO_SUPABASE/)
  assert.match(route, /CUT_OVER_TO_R2/)
  assert.match(route, /desiredId = rollbackMode \? source\.id : target\.id/)
})

test('rollback revalidates source bytes but does not depend on a healthy R2 read', () => {
  assert.match(route, /if \(!rollbackMode\) \{/)
  assert.match(route, /const targetDigest = await digestLive\(target/)
  assert.match(route, /const sourceDigest = await digestLive\(source/)
})


test('rollback readiness can be verified without changing Dataset Version references', () => {
  assert.match(route, /type Mode = 'dry-run' \| 'dry-run-rollback' \| 'apply' \| 'rollback'/)
  assert.match(route, /rollbackMode = mode === 'rollback' \|\| mode === 'dry-run-rollback'/)
  assert.match(route, /mode === 'dry-run' \|\| mode === 'dry-run-rollback'/)
  assert.match(route, /currentProvider: rollbackMode \? 'r2' : 'supabase'/)
  assert.match(route, /desiredProvider: rollbackMode \? 'supabase' : 'r2'/)
})
