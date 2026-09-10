import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const filename = '20260911192000_make_synthetic_suite_rollback_safe.sql'
const migrationPath = path.join(targetDir, filename)
if (!fs.existsSync(migrationPath)) throw new Error(`Clean replay migration is missing: ${filename}`)

const source = fs.readFileSync(migrationPath, 'utf8')

const successOld = `v_success_old constant text := $needle$delete from app.organizations where id=v_org_id; v_org_id := null;
    update governance.integration_test_runs set status='PASSED',checks=v_checks,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','PASSED','checks',v_checks);$needle$;`
const successNew = `v_success_old constant text := $needle$delete from app.organizations where id=v_org_id;
    v_org_id := null;
    update governance.integration_test_runs set status='PASSED',checks=v_checks,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','PASSED','checks',v_checks);$needle$;`

const errorOld = `v_error_old constant text := $needle$v_error := sqlerrm; if v_org_id is not null then delete from app.organizations where id=v_org_id; end if;
    update governance.integration_test_runs set status='FAILED',checks=v_checks,error_message=v_error,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','FAILED','checks',v_checks,'error',v_error);$needle$;`
const errorNew = `v_error_old constant text := $needle$v_error := sqlerrm;
    if v_org_id is not null then delete from app.organizations where id=v_org_id; end if;
    update governance.integration_test_runs set status='FAILED',checks=v_checks,error_message=v_error,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','FAILED','checks',v_checks,'error',v_error);$needle$;`

const countOccurrences = (text, needle) => text.split(needle).length - 1
const successCount = countOccurrences(source, successOld)
const errorCount = countOccurrences(source, errorOld)
if (successCount !== 1) {
  throw new Error(`Expected exactly one historical synthetic success-cleanup formatting mismatch, found ${successCount}`)
}
if (errorCount !== 1) {
  throw new Error(`Expected exactly one historical synthetic exception-cleanup formatting mismatch, found ${errorCount}`)
}

const repaired = source.replace(successOld, successNew).replace(errorOld, errorNew)
fs.writeFileSync(migrationPath, repaired)
console.log(`REPAIRED ${filename}: aligned rollback-safety text needles with the immediately preceding committed synthetic-suite function formatting in disposable replay; released migration history remains unchanged.`)
