import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')

const file = path.join(targetDir, '20260911192000_make_synthetic_suite_rollback_safe.sql')
if (!fs.existsSync(file)) throw new Error(`Expected replay migration is missing: ${file}`)

let source = fs.readFileSync(file, 'utf8')

const compactSuccess = `delete from app.organizations where id=v_org_id; v_org_id := null;\n    update governance.integration_test_runs set status='PASSED',checks=v_checks,completed_at=now() where id=v_run_id;\n    return jsonb_build_object('run_id',v_run_id,'status','PASSED','checks',v_checks);`
const expandedSuccess = `delete from app.organizations where id=v_org_id;\n    v_org_id := null;\n    update governance.integration_test_runs set status='PASSED',checks=v_checks,completed_at=now() where id=v_run_id;\n    return jsonb_build_object('run_id',v_run_id,'status','PASSED','checks',v_checks);`

const compactError = `v_error := sqlerrm; if v_org_id is not null then delete from app.organizations where id=v_org_id; end if;\n    update governance.integration_test_runs set status='FAILED',checks=v_checks,error_message=v_error,completed_at=now() where id=v_run_id;\n    return jsonb_build_object('run_id',v_run_id,'status','FAILED','checks',v_checks,'error',v_error);`
const expandedError = `v_error := sqlerrm;\n    if v_org_id is not null then delete from app.organizations where id=v_org_id; end if;\n    update governance.integration_test_runs set status='FAILED',checks=v_checks,error_message=v_error,completed_at=now() where id=v_run_id;\n    return jsonb_build_object('run_id',v_run_id,'status','FAILED','checks',v_checks,'error',v_error);`

const successCount = source.split(compactSuccess).length - 1
const errorCount = source.split(compactError).length - 1
if (successCount !== 1 || errorCount !== 1) {
  throw new Error(`Expected exactly one compact synthetic rollback needle of each type; found success=${successCount}, error=${errorCount}`)
}

source = source.replace(compactSuccess, expandedSuccess).replace(compactError, expandedError)
fs.writeFileSync(file, source)
console.log('REPAIRED 20260911192000_make_synthetic_suite_rollback_safe.sql: normalized replay-only cleanup needles to the expanded Git predecessor body; production migration history and released migrations remain unchanged.')
