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
const personaWorkflow = fs.readFileSync('.github/workflows/governed-incident-13-persona-certification.yml', 'utf8')
const liveRunner = fs.readFileSync('scripts/run-13-persona-browser-acceptance.mjs', 'utf8')

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


test('live 13-persona browser acceptance is explicit manual-only read-only execution', () => {
  assert.match(personaWorkflow, /workflow_dispatch:/)
  assert.match(personaWorkflow, /live-browser-readonly/)
  assert.match(personaWorkflow, /live-browser-personas:\n\s+if: github\.event_name == 'workflow_dispatch'/)
  assert.match(personaWorkflow, /PERSONA_PROJECT_ID: ab595892-828f-4585-bafb-b6c657585ce5/)
  assert.match(personaWorkflow, /DATANEXUS_BASE_URL: https:\/\/data-quality-ai-platform\.vercel\.app/)
  assert.doesNotMatch(personaWorkflow, /PERSONA_PASSWORD|TEST_PASSWORD|password.*secret/i)
})

test('live persona harness creates one-time real sessions without storing passwords or tokens in evidence', () => {
  assert.match(liveRunner, /admin\.auth\.admin\.generateLink/)
  assert.match(liveRunner, /type: 'magiclink'/)
  assert.match(liveRunner, /auth\.verifyOtp/)
  assert.match(liveRunner, /createServerClient/)
  assert.match(liveRunner, /chromium\.launch\(\{ headless: true \}\)/)
  assert.match(liveRunner, /passwordsStored: false/)
  assert.match(liveRunner, /sessionTokensRecorded: false/)
  assert.doesNotMatch(liveRunner, /console\.log\([^\n]*(access_token|refresh_token|serviceRoleKey|cookies)/)
})

test('live persona harness executes the authoritative 13-persona registry and only READ acceptance tasks', () => {
  assert.match(liveRunner, /Expected exactly 13 unique personas/)
  assert.match(liveRunner, /personaAcceptanceTasks/)
  assert.match(liveRunner, /mode: 'READ'/)
  assert.match(liveRunner, /mutationTasksExecuted: false/)
  assert.match(liveRunner, /\/home\/\$\{slug\}/)
  assert.match(liveRunner, /readRoutesPassed/)
})

test('live persona evidence is durable and secret-scoped', () => {
  assert.match(personaWorkflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/)
  assert.match(personaWorkflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/)
  assert.match(personaWorkflow, /retention-days: 90/)
  assert.match(personaWorkflow, /if-no-files-found: error/)
  assert.match(liveRunner, /DATANEXUS_13_PERSONA_LIVE_BROWSER_ACCEPTANCE/)
})
