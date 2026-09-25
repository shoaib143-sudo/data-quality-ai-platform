import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const workflow = fs.readFileSync('.github/workflows/governed-incident-13-persona-certification.yml', 'utf8')
const runner = fs.readFileSync('scripts/run-13-persona-browser-acceptance.mjs', 'utf8')

test('literal persona browser acceptance is explicit manual-only', () => {
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /live-browser-personas:\n\s+if: github\.event_name == 'workflow_dispatch' && inputs\.operation == 'live-browser-readonly'/)
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/)
  assert.match(workflow, /retention-days: 90/)
})

test('runner derives exactly thirteen personas from the authoritative registry', () => {
  assert.match(runner, /lib\/governance\/personas\.ts/)
  assert.match(runner, /Expected exactly 13 unique personas/)
  assert.match(runner, /persona\.\$\{slug\}@datanexus\.test/)
  assert.match(runner, /expectedRoleKey\(slug\)/)
})

test('runner verifies governed identity and binding evidence before browser execution', () => {
  assert.match(runner, /project_role_bindings/)
  assert.match(runner, /organization_members/)
  assert.match(runner, /userBindings\.length !== 1/)
  assert.match(runner, /role_key/)
  assert.match(runner, /PERSONA_PROJECT_ID/)
})

test('runner uses one-time magic-link sessions without password resets', () => {
  assert.match(runner, /admin\.generateLink/)
  assert.match(runner, /type: 'magiclink'/)
  assert.match(runner, /verifyOtp/)
  assert.match(runner, /createServerClient/)
  assert.doesNotMatch(runner, /signInWithPassword/)
  assert.doesNotMatch(runner, /updateUserById[\s\S]*password/)
})

test('runner executes only READ-mode acceptance routes', () => {
  assert.match(runner, /persona-acceptance-tasks\.ts/)
  assert.match(runner, /mode: 'READ'/)
  assert.match(runner, /testMode: 'READ_ONLY_BROWSER'/)
  assert.match(runner, /mutationTasksExecuted: false/)
})

test('browser evidence enforces exact persona home routing and fails closed', () => {
  assert.match(runner, /finalUrl\.pathname === `\/home\/\$\{slug\}`/)
  assert.match(runner, /personaCountExecuted/)
  assert.match(runner, /failedPersonas/)
  assert.match(runner, /evidence\.status !== 'PASS'/)
  assert.match(workflow, /if-no-files-found: error/)
})


test('read-only acceptance rejects silent redirects away from the requested route', () => {
  assert.match(runner, /finalUrl\.pathname === requested\.pathname/)
  assert.doesNotMatch(runner, /target !== `\/home\/\$\{slug\}` \|\| finalUrl\.pathname ===/)
})

test('literal persona acceptance proves negative cross-persona home isolation', () => {
  assert.match(runner, /crossPersonaIsolation/)
  assert.match(runner, /isolationFinal\.pathname !== isolationTarget\.pathname/)
  assert.match(runner, /crossPersonaIsolationPassed/)
  assert.match(runner, /!item\.crossPersonaIsolationPassed/)
})
