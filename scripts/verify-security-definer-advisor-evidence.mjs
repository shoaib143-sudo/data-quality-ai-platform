import fs from 'node:fs'

const path = 'supabase/migrations/20260915084500_certify_security_definer_advisor_exceptions.sql'
const sql = fs.readFileSync(path, 'utf8').toLowerCase()

for (const marker of [
  'verify_security_definer_advisor_exceptions',
  "is_org_admin','is_org_member','is_project_admin','is_project_member",
  'resolve_runtime_interrupt',
  "has_function_privilege('authenticated', p.oid, 'execute')",
  "has_function_privilege('anon', p.oid, 'execute')",
  "position('auth.uid()' in lower(p.prosrc))",
  "position('app_private.is_project_admin' in lower(p.prosrc))",
  "position('action_payload_hash' in lower(p.prosrc))",
  "'accepted_governed_exception'",
  'unexpected_authenticated_security_definer_count',
  'revoke all on function governance.verify_security_definer_advisor_exceptions() from public, anon, authenticated',
  'grant execute on function governance.verify_security_definer_advisor_exceptions() to service_role',
]) {
  if (!sql.includes(marker)) throw new Error(`Missing advisor evidence marker: ${marker}`)
}

if (/grant\s+execute\s+on\s+function\s+governance\.verify_security_definer_advisor_exceptions\(\)\s+to\s+(?:public|anon|authenticated)/i.test(sql)) {
  throw new Error('Advisor evidence verifier must remain service-role-only')
}

console.log('SECURITY DEFINER advisor evidence contract verified.')
