import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync('.github/workflows/autonomous-agent-governance.yml', 'utf8')
const runner = readFileSync('scripts/run-governance-orchestrator-off-live.mjs', 'utf8')
const loader = readFileSync('scripts/node-ts-alias-loader.mjs', 'utf8')

test('live OFF baseline runs only on protected-main push', () => {
  assert.match(workflow, /live-off-baseline:\n\s+if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/)
  assert.match(workflow, /vars\.GOVERNANCE_OFF_TEST_PROJECT_ID != ''/)
  assert.match(workflow, /GOVERNANCE_E2E_PROJECT_ID: \$\{\{ vars\.GOVERNANCE_OFF_TEST_PROJECT_ID \}\}/)
  assert.match(runner, /PROJECT_ID === PRIMARY_PROJECT_ID/)
  assert.doesNotMatch(runner, /update\([^)]*orchestrator_autonomy_policies/)
})

test('live OFF baseline uses service-role credentials without exposing them', () => {
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/)
  assert.doesNotMatch(runner, /console\.log\([^\n]*SERVICE_ROLE/)
})

test('runner calls the real Governance Orchestrator service', () => {
  assert.match(runner, /runGovernanceOrchestrator/)
  assert.match(runner, /from '@\/lib\/orchestration\/governance-orchestrator-service-v2'/)
})

test('runner verifies actor authorization before the service call', () => {
  assert.match(runner, /has_project_capability/)
  assert.match(runner, /p_capability: 'agent\.execute'/)
})

test('OFF baseline is fail closed and cannot create execution state', () => {
  assert.match(runner, /result\.status !== 'BLOCKED_POLICY'/)
  assert.match(runner, /persisted\.supervisor_run_id !== null/)
  assert.match(runner, /persisted\.ai_capability_e2e_run_id !== null/)
  assert.match(runner, /result\.decision\.allowed !== false/)
})

test('TypeScript path loader maps repository aliases without external runtime dependencies', () => {
  assert.match(loader, /specifier\.startsWith\('@\/'\)/)
  assert.match(loader, /basePath \+ '\.ts'/)
})
