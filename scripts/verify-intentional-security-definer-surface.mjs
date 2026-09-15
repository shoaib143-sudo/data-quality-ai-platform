import fs from 'node:fs'

const foundation = fs.readFileSync('supabase/migrations/20260823000000_foundation_app_catalog_agent.sql', 'utf8')
const membershipAcl = fs.readFileSync('supabase/migrations/20260903170000_restore_authenticated_membership_helper_execution.sql', 'utf8')
const interrupt = fs.readFileSync('supabase/migrations/20260912054005_harden_runtime_interrupt_authorization_order.sql', 'utf8')

const membershipHelpers = [
  'app_private.is_org_admin(uuid)',
  'app_private.is_org_member(uuid)',
  'app_private.is_project_admin(uuid)',
  'app_private.is_project_member(uuid)',
]

const checks = []

for (const helper of membershipHelpers) {
  const functionName = helper.replace('(uuid)', '')
  checks.push([
    `${helper} is defined as SECURITY DEFINER with an empty search_path`,
    foundation.includes(`FUNCTION ${functionName}(`) &&
      foundation.includes('SECURITY DEFINER') &&
      foundation.includes("SET search_path = ''"),
  ])
  checks.push([
    `${helper} is explicitly granted only to authenticated in the restored ACL boundary`,
    membershipAcl.includes(`GRANT EXECUTE ON FUNCTION ${helper} TO authenticated;`) &&
      membershipAcl.includes(`REVOKE EXECUTE ON FUNCTION ${helper} FROM anon;`) &&
      !membershipAcl.includes(`GRANT EXECUTE ON FUNCTION ${helper} TO anon;`) &&
      !membershipAcl.includes(`GRANT EXECUTE ON FUNCTION ${helper} TO public;`),
  ])
}

checks.push([
  'membership helper schema usage is authenticated-only at the explicit restore boundary',
  membershipAcl.includes('GRANT USAGE ON SCHEMA app_private TO authenticated;') &&
    !membershipAcl.includes('GRANT USAGE ON SCHEMA app_private TO anon;'),
])

for (const needle of [
  'm.user_id = auth.uid()',
  "m.role IN ('OWNER','ADMIN')",
  'WHERE p.id = p_project_id',
]) {
  checks.push([`membership helper identity/scope contract contains ${needle}`, foundation.includes(needle)])
}

checks.push([
  'runtime interrupt RPC remains SECURITY DEFINER with empty search_path',
  interrupt.includes('CREATE OR REPLACE FUNCTION agent.resolve_runtime_interrupt(') &&
    interrupt.includes('SECURITY DEFINER') &&
    interrupt.includes("SET search_path = ''"),
])
checks.push([
  'runtime interrupt RPC requires a current authenticated identity',
  interrupt.includes('v_user_id := auth.uid();') &&
    interrupt.includes("RAISE EXCEPTION 'Authentication is required';"),
])
checks.push([
  'runtime interrupt authorization is project-admin scoped before the row lock',
  interrupt.includes('AND app_private.is_project_admin(r.project_id)') &&
    interrupt.indexOf('AND app_private.is_project_admin(r.project_id)') < interrupt.indexOf('FOR UPDATE OF i;'),
])
checks.push([
  'runtime interrupt RPC exposes only the authenticated human-review boundary',
  interrupt.includes('REVOKE ALL ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) FROM public, anon, service_role;') &&
    interrupt.includes('GRANT EXECUTE ON FUNCTION agent.resolve_runtime_interrupt(uuid,text,text,jsonb) TO authenticated;'),
])
checks.push([
  'runtime interrupt payload binding remains fail closed',
  interrupt.includes('v_interrupt.action_payload_hash IS DISTINCT FROM v_action_payload_hash') &&
    interrupt.includes("RAISE EXCEPTION 'Approval payload does not match the pending action';"),
])
checks.push([
  'runtime interrupt unknown and unauthorized identifiers share one failure surface',
  interrupt.includes("RAISE EXCEPTION 'Agent runtime interrupt is unavailable';"),
])

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)

if (failures.length) {
  console.error(`Intentional SECURITY DEFINER surface verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}

console.log(`Intentional SECURITY DEFINER surface contract passed (${checks.length} checks).`)
