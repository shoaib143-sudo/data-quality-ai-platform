import fs from 'node:fs'

const helperPath = 'scripts/prepare-clean-membership-helper-acl-replay.mjs'
const helper = fs.readFileSync(helperPath, 'utf8')
const requiredAuthenticated = [
  'app_private.is_org_admin(uuid)',
  'app_private.is_org_member(uuid)',
  'app_private.is_project_admin(uuid)',
  'app_private.is_project_member(uuid)',
]

const checks = [
  ['replay repair is placed immediately before the security posture assertion', helper.includes("20260906120959")],
  ['authenticated receives exactly the four canonical RLS helper grants', requiredAuthenticated.every((fn) => helper.includes(`grant execute on function ${fn} to authenticated;`))],
  ['anonymous execution remains denied for all four helpers', requiredAuthenticated.every((fn) => helper.includes(`revoke execute on function ${fn} from anon;`))],
  ['app_private is not granted to anon', !helper.includes('grant usage on schema app_private to anon') && !helper.includes('grant execute on function app_private') || requiredAuthenticated.every((fn) => !helper.includes(`grant execute on function ${fn} to anon;`))],
  ['repair does not grant membership helpers to public or service_role', !helper.includes(' to public;') && !helper.includes(' to service_role;')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Membership helper ACL replay verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log('Membership helper ACL replay contract passed.')
