import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260915164000_govern_authenticated_security_definer_allowlist.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')
const lower = sql.toLowerCase()

const requiredMarkers = [
  'governance.verify_authenticated_security_definer_allowlist()',
  'app_private.is_org_admin(uuid)',
  'app_private.is_org_member(uuid)',
  'app_private.is_project_admin(uuid)',
  'app_private.is_project_member(uuid)',
  'agent.resolve_runtime_interrupt(uuid, text, text, jsonb)',
  'request_execution_recovery_action_admin',
  "position('auth.uid()' in lower(p.prosrc)) > 0",
  "position('app_private.is_project_admin' in lower(p.prosrc)) > 0",
  "position('for update of i' in lower(p.prosrc)) > 0",
  "position('action_payload_hash' in lower(p.prosrc)) > 0",
  "position('expires_at' in lower(p.prosrc)) > 0",
  'v_unexpected_authenticated_exec = 0',
  "raise exception 'authenticated_security_definer_allowlist_failed: %'",
]

for (const marker of requiredMarkers) {
  if (!lower.includes(marker.toLowerCase())) {
    throw new Error(`Authenticated SECURITY DEFINER allowlist migration missing marker: ${marker}`)
  }
}

for (const fn of [
  'app_private.is_org_admin(uuid)',
  'app_private.is_org_member(uuid)',
  'app_private.is_project_admin(uuid)',
  'app_private.is_project_member(uuid)',
  'agent.resolve_runtime_interrupt(uuid, text, text, jsonb)',
]) {
  const revoke = `revoke all on function ${fn} from public, anon;`
  if (!lower.includes(revoke)) {
    throw new Error(`Missing fail-closed PUBLIC/anon revoke for ${fn}`)
  }
}

if (/grant\s+execute\s+on\s+function\s+(?:app_private|agent)\.[^;]+\s+to\s+(?:public|anon)(?:\s|,|;)/i.test(sql)) {
  throw new Error('Allowlist migration must never grant privileged function execution to PUBLIC or anon')
}

if (!/revoke\s+all\s+on\s+function\s+governance\.verify_authenticated_security_definer_allowlist\(\)\s+from\s+public,\s*anon,\s*authenticated;/i.test(sql)) {
  throw new Error('Verifier must remain service-role-only')
}

console.log('Authenticated SECURITY DEFINER allowlist contract verified.')
