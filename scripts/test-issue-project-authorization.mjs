import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const collectionSource = await readFile(new URL('../app/api/issues/route.ts', import.meta.url), 'utf8')
const detailSource = await readFile(new URL('../app/api/issues/[issueId]/route.ts', import.meta.url), 'utf8')
const commentsSource = await readFile(new URL('../app/api/issues/[issueId]/comments/route.ts', import.meta.url), 'utf8')
const authorizationSource = await readFile(new URL('../lib/auth/authorize.ts', import.meta.url), 'utf8')

function assertPrivilegedRouteUsesApiAuth(source, label) {
  assert.match(source, /requireApiUser\(\)/, `${label} must use JSON-safe API authentication`)
  assert.doesNotMatch(source, /requireUser\(\)/, `${label} must not redirect unauthenticated API callers`)
  assert.match(source, /createAdminClient\(\)/, `${label} must keep privileged access server-side only`)
}

assertPrivilegedRouteUsesApiAuth(collectionSource, 'Issue collection route')
assertPrivilegedRouteUsesApiAuth(detailSource, 'Issue detail route')
assertPrivilegedRouteUsesApiAuth(commentsSource, 'Issue comments route')

assert.match(collectionSource, /if \(!projectId\)[\s\S]*projectId is required\./, 'Issue listing must require explicit project context')
const collectionCapabilityCalls = collectionSource.match(/authorizeProject\(user\.id, projectId, 'issues\.manage'\)/g) ?? []
assert.equal(collectionCapabilityCalls.length, 2, 'Issue listing and creation must both require issues.manage')
assert.match(collectionSource, /from\('issues'\)[\s\S]*\.eq\('project_id', projectId\)[\s\S]*\.order\('created_at'/, 'Privileged issue listing must always be project-scoped')
assert.doesNotMatch(collectionSource, /organization_members|async function access\(/, 'Issue collection route must not use ad hoc membership authorization')

assert.match(detailSource, /authorizeProject\(user\.id, issue\.project_id, 'issues\.manage'\)/, 'Issue mutation must require issues.manage for the resolved issue project')
assert.match(commentsSource, /authorizeProject\(user\.id, issue\.project_id, 'issues\.manage'\)/, 'Issue comments must require issues.manage for the resolved issue project')
assert.doesNotMatch(commentsSource, /organization_members|project_members/, 'Issue comments must not use ad hoc membership authorization')

assert.match(authorizationSource, /\| 'issues\.manage'/, 'Central authorization capability vocabulary must include issues.manage')
assert.match(authorizationSource, /authorizeProject[\s\S]*assertProjectBelongsToInstanceOrganization\(projectId\)/, 'Central project authorization must fail closed outside the instance organization')
assert.match(authorizationSource, /authorizeProject[\s\S]*resolveInstanceOrganizationMembership\(userId\)/, 'Central project authorization must require canonical organization membership')

console.log('Issue project authorization boundary checks passed.')
