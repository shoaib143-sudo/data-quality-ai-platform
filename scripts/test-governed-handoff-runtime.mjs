import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const workerSource = fs.readFileSync('lib/agents/governance-job-worker.ts', 'utf8')

for (const required of [
  "import { createGovernedHandoffEnvelope } from '@/lib/agents/governed-handoff-contract'",
  "import { isGovernedAgentKey, type GovernedAgentKey } from '@/lib/agents/governed-agent-registry'",
  "if (!isGovernedAgentKey(sourceAgentKey))",
  "if (!isGovernedAgentKey(agentKey))",
  'sourceAgentKey: handoff.sourceAgentKey',
  "confidence: 'UNSPECIFIED'",
  'evidenceRefs: [input.sourceAgentRunId]',
  'handoff_contract_version: envelope.contractVersion',
  'handoff_requires_fresh_authorization: envelope.requiresFreshAuthorization',
]) {
  assert.ok(workerSource.includes(required), `missing durable handoff runtime invariant: ${required}`)
}

assert.ok(
  workerSource.indexOf('const envelope = createGovernedHandoffEnvelope({')
    < workerSource.indexOf("from('agent_messages').insert({"),
  'typed handoff envelope must be validated before persistence',
)

assert.equal(
  workerSource.includes('autoExecute: true'),
  false,
  'durable handoff runtime must never auto-execute from the persisted envelope',
)

console.log('Durable handoff runtime validates canonical source/target agents, persists typed provenance, and requires fresh authorization before downstream execution.')
