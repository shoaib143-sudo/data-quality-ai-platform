import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')
if (!fs.existsSync(targetDir)) throw new Error(`TARGET_MIGRATION_DIR does not exist: ${targetDir}`)

const version = '20260906120959'
const name = 'reconcile_membership_helper_acl'
const replayPath = path.join(targetDir, `${version}_${name}.sql`)

if (fs.existsSync(replayPath)) {
  throw new Error(`Clean replay already contains ${path.basename(replayPath)}`)
}

const sql = `-- Disposable replay reconciliation only.
-- The authoritative security posture requires exactly four read-only SECURITY DEFINER
-- membership helpers to be executable by authenticated users for RLS evaluation,
-- while app_private remains outside PostgREST and anonymous execution remains denied.
grant usage on schema app_private to authenticated;

grant execute on function app_private.is_org_admin(uuid) to authenticated;
grant execute on function app_private.is_org_member(uuid) to authenticated;
grant execute on function app_private.is_project_admin(uuid) to authenticated;
grant execute on function app_private.is_project_member(uuid) to authenticated;

revoke execute on function app_private.is_org_admin(uuid) from anon;
revoke execute on function app_private.is_org_member(uuid) from anon;
revoke execute on function app_private.is_project_admin(uuid) from anon;
revoke execute on function app_private.is_project_member(uuid) from anon;
`

fs.writeFileSync(replayPath, sql)
console.log(`RECONSTRUCTED ${path.basename(replayPath)}: clean released-history replay loses the four authenticated RLS-helper EXECUTE grants before the canonical database API posture assertion; this restores exactly the production ACL model at that boundary without exposing app_private through PostgREST.`)
