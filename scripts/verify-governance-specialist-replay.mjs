import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912031500_governance_specialist_replay_certification.sql', 'utf8')
const specialist = readFileSync('lib/agents/governance-specialist-agent.ts', 'utf8')
const registry = readFileSync('lib/agents/governed-agent-registry.ts', 'utf8')
const route = readFileSync('app/api/agents/governance/run/route.ts', 'utf8')

const agents = [
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
]

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

function sliceBetween(source, start, end, label) {
  const startIndex = source.indexOf(start)
  assert.ok(startIndex >= 0, `${label} start marker missing: ${start}`)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.ok(endIndex > startIndex, `${label} end marker missing: ${end}`)
  return source.slice(startIndex, endIndex)
}

function assertNoProjectWrites(source, label) {
  for (const token of ['.insert(', '.update(', '.delete(', '.upsert(']) {
    assert.equal(source.includes(token), false, `${label} must not mutate governed project state; found ${token}`)
  }
}

for (const agent of agents) contains(migration, `'${agent}'`, `${agent} migration scope`)
contains(migration, "t.tool_key = 'governance_specialist_investigate'", 'active specialist certification scope')
contains(migration, "set version = '1.1'", 'active specialist contract version')
contains(migration, "'read_only', true", 'read-only classification')
contains(migration, "'idempotent', true", 'idempotent classification')
contains(migration, "'replay_certified', true", 'replay certification')
contains(migration, "'retryable_error_codes', pg_catalog.jsonb_build_array('STEP_FAILED')", 'bounded retry certification')
contains(migration, "t.tool_key = 'read_project_snapshot'", 'legacy snapshot scope')
contains(migration, 'set enabled = false', 'legacy tool disable')
contains(migration, "'replaced_by', 'governance_specialist_investigate'", 'legacy replacement marker')
contains(migration, 'if v_certified <> 6 then', 'six-tool certification postcondition')
contains(migration, 'if v_legacy_enabled <> 0 then', 'legacy disable postcondition')
contains(migration, 'if v_uncertified_enabled <> 0 then', 'no-enabled-gap postcondition')

for (const agent of agents) {
  const start = registry.indexOf(`${agent}: {`)
  assert.ok(start >= 0, `${agent} registry policy missing`)
  const next = registry.indexOf('\n  },', start)
  const policy = registry.slice(start, next)
  contains(policy, "mutationBoundary: 'READ_ONLY'", `${agent} mutation boundary`)
  contains(policy, "'governance_specialist_investigate'", `${agent} native specialist allowlist`)
  assert.equal(policy.includes("'read_project_snapshot'"), false, `${agent} must not allow the deprecated snapshot tool`)
}

const loadKnowledge = sliceBetween(specialist, 'async function loadKnowledge', 'async function loadGraph', 'loadKnowledge')
const loadGraph = sliceBetween(specialist, 'async function loadGraph', 'async function loadContext', 'loadGraph')
const loadContext = sliceBetween(specialist, 'async function loadContext', 'function projectRisk', 'loadContext')
assertNoProjectWrites(loadKnowledge, 'loadKnowledge')
assertNoProjectWrites(loadGraph, 'loadGraph')
assertNoProjectWrites(loadContext, 'loadContext')

const admissionIndex = specialist.indexOf("toolKey: 'governance_specialist_investigate'")
const contextIndex = specialist.indexOf('loadContext(admin, input.projectId)', admissionIndex)
assert.ok(admissionIndex >= 0 && contextIndex > admissionIndex, 'native tool admission must occur before specialist evidence loading')
contains(specialist, 'await completeNativeToolInvocation({', 'native completion evidence')
contains(specialist, 'await failNativeToolInvocation({', 'native failure evidence')

contains(route, "import { executeGovernanceSpecialistAgent }", 'live specialist route')
contains(route, 'const result = await executeGovernanceSpecialistAgent({', 'live specialist execution')
assert.equal(route.includes('executeGovernanceReadAgent'), false, 'legacy read agent must not be used by the live governance route')

console.log('Governance specialist replay certification verified.')
