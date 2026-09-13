import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../app/admin/project-roles/page.tsx', import.meta.url), 'utf8')

assert.match(page, /import \{ governancePersonaRoleKeys \} from '@\/lib\/governance\/persona-role-keys'/, 'Presentation must use the governed persona-role source.')
assert.match(page, /governancePersonaRoleKeys\.length/, 'Displayed persona count must be computed from the authoritative collection.')
assert.doesNotMatch(page, /\b(eleven|twelve|thirteen|fourteen|11|12|13|14) approved governance personas\b/i, 'Persona count must not be duplicated as a literal.')
assert.match(page, /from\('access_roles'\).*\.in\('role_key',\[\.\.\.governancePersonaRoleKeys\]\)/s, 'Role retrieval must remain bounded to the same governed persona catalog.')

console.log('project role persona count adversarial audit: PASS', {
  duplicatedPersonaCount: false,
  authoritativeCatalogDrivesCopy: true,
  roleQueryBoundaryPreserved: true,
})
