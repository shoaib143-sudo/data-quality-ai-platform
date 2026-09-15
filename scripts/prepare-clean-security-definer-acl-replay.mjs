import fs from 'node:fs'
import path from 'node:path'

const targetDir = process.env.TARGET_MIGRATION_DIR
if (!targetDir) throw new Error('TARGET_MIGRATION_DIR is required')

const filename = '20260915163959_reconcile_security_definer_acl.sql'
const sql = `-- Disposable clean-replay reconciliation only.
-- Production and released migrations already revoke browser execution on these internal helpers.
revoke all on function governance.capture_glossary_term_version() from public, anon, authenticated, service_role;
revoke all on function governance.enforce_glossary_mapping_integrity() from public, anon, authenticated, service_role;
revoke all on function governance.on_catalog_revision_refresh_stewardship() from public, anon, authenticated, service_role;
revoke all on function orchestration.resolve_failed_job_dependencies() from public;
revoke execute on function orchestration.resolve_failed_job_dependencies() from anon, authenticated;
`

fs.writeFileSync(path.join(targetDir, filename), sql)
console.log(`RECONSTRUCTED ${filename}: clean released-history replay restores the verified production ACL boundary for internal SECURITY DEFINER functions before the authenticated allowlist assertion.`)
