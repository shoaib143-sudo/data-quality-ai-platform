import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260912191500_harden_production_api_security_posture.sql'
const healthPath = 'app/api/health/ready/route.ts'
const migration = fs.readFileSync(migrationPath, 'utf8')
const health = fs.readFileSync(healthPath, 'utf8')

for (const marker of [
  'revoke all on function orchestration.capture_terminal_recovery_case() from public, anon, authenticated',
  'revoke all on function orchestration.enforce_recovery_retry_ceiling() from public, anon, authenticated',
  'revoke all on function orchestration.resolve_execution_recovery_after_success() from public, anon, authenticated',
  'request_execution_recovery_action_admin(uuid, text)',
  "position('auth.uid()' in lower(p.prosrc)) > 0",
  "position('app_private.is_project_admin' in lower(p.prosrc)) > 0",
  'v_unapproved_exposed_privileged_functions=0',
  'governed_admin_recovery_rpc_authorization_guarded',
  'DATABASE_API_SECURITY_POSTURE_HARDENING_FAILED',
  'grant execute on function governance.verify_database_api_security_posture() to service_role',
]) {
  if (!migration.toLowerCase().includes(marker.toLowerCase())) {
    throw new Error(`Security posture migration missing contract marker: ${marker}`)
  }
}

if (!health.includes("schema('governance').rpc('verify_database_api_security_posture')")) {
  throw new Error('Production readiness endpoint must continue to use the database security posture verifier')
}

if (/grant\s+execute\s+on\s+function\s+governance\.verify_database_api_security_posture\(\)\s+to\s+(?:public|anon|authenticated)/i.test(migration)) {
  throw new Error('Security posture verifier must remain service-role-only')
}

console.log('Production security posture hardening contract verified.')
