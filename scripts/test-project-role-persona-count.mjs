import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [page, roleKeys] = await Promise.all([
  readFile(new URL('../app/admin/project-roles/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../lib/governance/persona-role-keys.ts', import.meta.url), 'utf8'),
])

const keys = [...roleKeys.matchAll(/^\s*'([A-Z_]+)',\s*$/gm)].map(match => match[1])
assert.equal(keys.length, 13, 'Governed persona-role catalog must contain all 13 approved personas.')
assert.match(page, /\{governancePersonaRoleKeys\.length\} approved governance personas/, 'Project Roles copy must derive its count from the authoritative persona-role catalog.')
assert.doesNotMatch(page, /eleven approved governance personas|thirteen approved governance personas|13 approved governance personas/i, 'Project Roles must not hard-code the persona count in prose.')
assert.match(page, /\.in\('role_key',\[\.\.\.governancePersonaRoleKeys\]\)/, 'Role selector query must use the same authoritative persona-role catalog as the displayed count.')

console.log('project role persona count contract: PASS', { personaCount: keys.length })
