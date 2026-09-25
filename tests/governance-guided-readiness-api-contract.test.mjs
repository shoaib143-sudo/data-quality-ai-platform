import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const route = fs.readFileSync(
  'app/api/agents/governance-orchestrator/guided-readiness/route.ts',
  'utf8',
)

test('GUIDED readiness requires current-scope discovery evidence', () => {
  assert.match(route, /from\('discovery_runs'\)/)
  assert.match(route, /\.in\('scope_version_id', selectedScopeVersionIds\)/)
  assert.match(route, /CURRENT_SCOPE_DISCOVERY_EVIDENCE_MISSING/)
  assert.match(route, /observedObjects >= expectedObjects/)
  assert.match(route, /missingObjects === 0/)
})

test('GUIDED readiness exposes project participant bindings without user identifiers', () => {
  assert.match(route, /from\('project_role_bindings'\)/)
  assert.match(route, /activeParticipantCount/)
  assert.match(route, /activeBindingCount/)
  assert.match(route, /roleCounts/)
  assert.doesNotMatch(route, /participantReadiness:[\s\S]*userIds/)
})

test('GUIDED readiness distinguishes operator execution capability from discovery capability', () => {
  assert.match(route, /hasProjectCapability\(user\.id, projectId, 'agent\.execute'\)/)
  assert.match(route, /hasProjectCapability\(user\.id, projectId, 'discovery\.execute'\)/)
  assert.match(route, /OPERATOR_AGENT_EXECUTE_MISSING/)
})

test('GUIDED E2E readiness fails closed when any live prerequisite is blocked', () => {
  assert.match(route, /e2eReady: result\.ready && preflightBlockerCodes\.length === 0/)
  assert.match(route, /PROJECT_ROLE_BINDINGS_MISSING/)
  assert.match(route, /SELECTED_TABLES_NOT_READY/)
})
