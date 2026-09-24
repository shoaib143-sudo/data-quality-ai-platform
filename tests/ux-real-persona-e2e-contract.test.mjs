import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const personasSource = fs.readFileSync('lib/governance/personas.ts', 'utf8')
const accessibilitySource = fs.readFileSync('lib/accessibility/persona-accessibility.ts', 'utf8')
const workspacePolicy = fs.readFileSync('lib/governance/workspace-policy.ts', 'utf8')
const personaHome = fs.readFileSync('app/home/[persona]/page.tsx', 'utf8')
const roleLanding = fs.readFileSync('components/governance/role-landing-page.tsx', 'utf8')
const manifest = fs.readFileSync('docs/ux/DATANEXUS-UX-ALL-PAGES-REVALIDATION.md', 'utf8')
const acceptance = fs.readFileSync('docs/ux/DUAL-ENVIRONMENT-ACCEPTANCE-MATRIX.md', 'utf8')
const wcag = JSON.parse(fs.readFileSync('infra/accessibility/wcag22-aa-persona-contract.json', 'utf8'))

function extractQuotedArray(source, declaration) {
  const marker = 'export const ' + declaration + ' = ['
  const start = source.indexOf(marker)
  assert.ok(start >= 0, 'Unable to locate ' + declaration)
  const tail = source.slice(start + marker.length)
  const end = tail.indexOf('] as const')
  assert.ok(end >= 0, 'Unable to locate end of ' + declaration)
  return [...tail.slice(0, end).matchAll(/'([^']+)'/g)].map(row => row[1])
}

test('controlled E2E uses the real DataNexus persona registry as its authority', () => {
  const governancePersonas = extractQuotedArray(personasSource, 'personaSlugs')
  const accessibilityPersonas = extractQuotedArray(accessibilitySource, 'ACCESSIBILITY_PERSONAS')

  assert.equal(governancePersonas.length, 13)
  assert.deepEqual(accessibilityPersonas, governancePersonas)
  assert.deepEqual(wcag.personas, governancePersonas)
  assert.equal(new Set(governancePersonas).size, governancePersonas.length)

  for (const persona of governancePersonas) {
    assert.ok(workspacePolicy.includes("'" + persona + "': ["), 'Workspace policy missing persona ' + persona)
  }
})

test('persona browser journeys remain bound to authenticated real-persona routing', () => {
  assert.match(personaHome, /if \(!isPersonaSlug\(slug\)\) notFound\(\)/)
  assert.match(personaHome, /const user = await requireUser\(\)/)
  assert.match(personaHome, /const access = await resolveLandingAccess\(user\.id\)/)
  assert.match(personaHome, /if \(slug !== access\.persona\) redirect\('\/home'\)/)
  assert.match(workspacePolicy, /if \(workspace === 'admin'\) return Boolean\(organizationRole && \/\^\(OWNER\|ADMIN\)\$\/i\.test\(organizationRole\)\)/)
  assert.match(roleLanding, /canAccessWorkspaceHref\(persona\.slug, item\.href, orgRole\)/)
})

test('all-page scope includes the dynamic real-persona home and controlled evidence wording', () => {
  assert.match(manifest, /app\/home\/\[persona\]\/page\.tsx/)
  assert.match(acceptance, /real application experiences, not simulated personas/i)
  assert.match(acceptance, /synthetic datasets/i)
  assert.doesNotMatch(acceptance, /synthetic persona/i)
})
