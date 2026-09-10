import { readFile } from 'node:fs/promises'

const instanceSource = await readFile('lib/governance/instance-organization.ts', 'utf8')
const landingSource = await readFile('lib/governance/landing-access.ts', 'utf8')
const authorizationSource = await readFile('lib/auth/authorize.ts', 'utf8')
const personasSource = await readFile('lib/governance/personas.ts', 'utf8')

const checks = [
  [instanceSource, /from\('organizations'\)[\s\S]*select\('id'\)[\s\S]*limit\(2\)/, 'bounded canonical organization lookup'],
  [instanceSource, /organizations\.length !== 1[\s\S]*Single-organization invariant violated/, 'exactly-one organization invariant'],
  [instanceSource, /from\('organization_members'\)[\s\S]*eq\('user_id', userId\)/, 'authenticated user membership lookup'],
  [instanceSource, /unexpectedMemberships[\s\S]*organization_id[\s\S]*!== organizationId[\s\S]*throw new InstanceOrganizationIntegrityError/, 'unexpected organization membership rejection'],
  [instanceSource, /instanceMemberships\.length !== 1[\s\S]*Instance organization access denied/, 'fail-closed membership validation'],
  [instanceSource, /assertInstanceOrganizationId[\s\S]*organizationId !== instanceOrganizationId/, 'organization context assertion'],
  [instanceSource, /assertProjectBelongsToInstanceOrganization[\s\S]*from\('projects'\)[\s\S]*organization_id[\s\S]*assertInstanceOrganizationId\(organizationId\)/, 'project context assertion'],
  [landingSource, /resolveInstanceOrganizationMembership\(userId\)/, 'landing access uses instance organization membership'],
  [landingSource, /projects[\s\S]*eq\('organization_id', organizationId\)/, 'projects remain scoped to instance organization'],
  [landingSource, /assertInstanceOrganizationId\(organizationId\)/, 'landing settings reject foreign organization context'],
  [authorizationSource, /hasProjectCapability[\s\S]*assertProjectBelongsToInstanceOrganization\(projectId\)[\s\S]*has_project_capability/, 'direct capability checks enforce instance project boundary'],
  [authorizationSource, /authorizeProject[\s\S]*assertProjectBelongsToInstanceOrganization\(projectId\)[\s\S]*resolveInstanceOrganizationMembership\(userId\)/, 'project authorization enforces instance organization and membership'],
  [authorizationSource, /authorizeOrganizationAdmin[\s\S]*assertInstanceOrganizationId\(organizationId\)[\s\S]*resolveInstanceOrganizationMembership\(userId\)/, 'organization administration enforces instance organization'],
  [personasSource, /export const personaSlugs = \[[\s\S]*'metadata-analyst'[\s\S]*'data-quality-analyst'[\s\S]*\] as const/, 'existing persona registry preserved'],
]

for (const [source, pattern, label] of checks) {
  if (!pattern.test(source)) throw new Error(`Single-organization runtime contract failed: ${label}.`)
  console.log(`PASS ${label}`)
}

if (/from\('organization_members'\)[\s\S]{0,400}order\('created_at'[\s\S]{0,200}limit\(1\)/.test(landingSource)) {
  throw new Error('Single-organization runtime contract failed: landing access still selects organization by membership creation order.')
}
console.log('PASS no first-membership organization selection')

if (/authorizeProject[\s\S]{0,1400}project\.organization_id/.test(authorizationSource)) {
  throw new Error('Single-organization runtime contract failed: project authorization still trusts arbitrary project organization context.')
}
console.log('PASS project authorization does not trust arbitrary organization context')

const personaMatches = personasSource.match(/^\s*'[^']+',?$/gm) ?? []
if (personaMatches.length < 13) {
  throw new Error('Single-organization runtime contract failed: expected the existing 13 persona slugs to remain present.')
}
console.log('PASS existing 13-persona model remains present')

console.log('Single-organization runtime verification completed.')
