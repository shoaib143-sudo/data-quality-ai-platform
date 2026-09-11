import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912031500_specialist_read_replay_certification.sql','utf8')
const specialist = readFileSync('lib/agents/governance-specialist-agent.ts','utf8')
const readAgent = readFileSync('lib/agents/governance-read-agent.ts','utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

for (const key of [
  'steward_agent','governance_analyst_agent','architect_agent',
  'investigator_agent','executive_agent','support_agent',
]) contains(migration, `'${key}'`, `${key} certification scope`)

for (const tool of ['read_project_snapshot','governance_specialist_investigate']) {
  contains(migration, `'${tool}'`, `${tool} certification scope`)
}
contains(migration, "'read_only',true", 'read-only certification')
contains(migration, "'idempotent',true", 'idempotency certification')
contains(migration, "'replay_certified',true", 'replay certification')
contains(migration, "'side_effect_scope','runtime_evidence_only'", 'runtime evidence side-effect scope')
contains(migration, "'retryable_error_codes',pg_catalog.jsonb_build_array('STEP_FAILED')", 'bounded retry certification')
contains(migration, 'if v_specialist_certified <> 12 then', 'exact specialist certification count')
contains(migration, 'if v_uncertified_enabled <> 0 then', 'global enabled-tool replay baseline')

contains(specialist, "execution_mode: 'deterministic_specialist_read_only'", 'specialist read-only execution mode')
contains(specialist, "read_only: true", 'specialist audit read-only evidence')
contains(specialist, 'writeGovernanceAudit({', 'specialist governed audit evidence')
contains(specialist, 'startNativeAgentLifecycle({', 'specialist native lifecycle evidence')
contains(specialist, 'completeNativeToolInvocation({', 'specialist native invocation evidence')

contains(readAgent, "execution_mode: 'deterministic_read_only'", 'snapshot read-only execution mode')
contains(readAgent, "'This execution is read-only and bounded.'", 'snapshot read-only limitation')
contains(readAgent, 'writeGovernanceAudit({', 'snapshot governed audit evidence')

function mutationTargets(source) {
  const targets = []
  const pattern = /\.from\('([^']+)'\)[\s\S]{0,180}?\.(insert|update|upsert|delete)\(/g
  let match
  while ((match = pattern.exec(source))) targets.push({ table: match[1], operation: match[2] })
  return targets
}

for (const [source,label] of [[specialist,'specialist'],[readAgent,'snapshot']]) {
  const mutations = mutationTargets(source)
  assert.ok(mutations.length > 0, `${label} source should expose runtime evidence writes to this verifier`)
  for (const mutation of mutations) {
    assert.equal(
      mutation.table,
      'agent_runs',
      `${label} must not mutate governed domain table ${mutation.table} through ${mutation.operation}`,
    )
  }
}

console.log('Specialist read-only replay certification verified.')
