import fs from 'node:fs'

const helperPath = 'scripts/prepare-clean-synthetic-suite-rollback-replay.mjs'
const helper = fs.readFileSync(helperPath, 'utf8')

const checks = [
  ['repair targets only the rollback-safety migration', helper.includes("20260911192000_make_synthetic_suite_rollback_safe.sql")],
  ['success needle is aligned to the committed predecessor formatting', helper.includes("delete from app.organizations where id=v_org_id;\\n    v_org_id := null;")],
  ['error needle is aligned to the committed predecessor formatting', helper.includes("v_error := sqlerrm;\\n    if v_org_id is not null then delete from app.organizations where id=v_org_id; end if;")],
  ['repair fails closed on unexpected source shape', helper.includes('Expected exactly one compact synthetic rollback needle of each type') && helper.includes('successCount !== 1 || errorCount !== 1')],
  ['repair remains disposable-only', helper.includes('TARGET_MIGRATION_DIR') && helper.includes('production migration history and released migrations remain unchanged')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Synthetic rollback replay verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log('Synthetic rollback replay contract passed.')
