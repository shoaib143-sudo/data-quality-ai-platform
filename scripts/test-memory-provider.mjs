import assert from 'node:assert/strict'

const { CanonicalMemoryProvider } = await import('../lib/ai/memory-provider.ts')

const projectId = '479813aa-72a4-4b12-b72a-74da8d2419ce'
const workingCalls = []
const episodicCalls = []
const provider = new CanonicalMemoryProvider({
  listWorking: async (input) => {
    workingCalls.push(input)
    return [
      {
        id: 'working-active',
        project_id: projectId,
        agent_run_id: 'run-1',
        memory_key: 'investigation-context',
        content: { findingId: 'finding-1' },
        expires_at: '2999-01-01T00:00:00Z',
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:05:00Z',
      },
      {
        id: 'working-wrong-run',
        project_id: projectId,
        agent_run_id: 'run-2',
        memory_key: 'other',
        content: {},
        expires_at: '2999-01-01T00:00:00Z',
        created_at: '2026-09-08T10:00:00Z',
        updated_at: '2026-09-08T10:00:00Z',
      },
    ]
  },
  listEpisodic: async (input) => {
    episodicCalls.push(input)
    return [
      {
        id: 'case-verified',
        project_id: projectId,
        source_agent_run_id: 'run-source',
        case_key: 'dq-learning:verified',
        source_kind: 'DATA_QUALITY_RECOMMENDATION_LEARNING',
        problem_type: 'DATA_QUALITY_RECOMMENDATION',
        context: { datasetId: 'dataset-1' },
        decision_status: 'VERIFIED',
        outcome_status: 'VERIFIED',
        effectiveness: '1',
        confidence: '0.95',
        evidence: { source_id: 'learning-1' },
        status: 'ACTIVE',
        occurred_at: '2026-09-08T11:00:00Z',
      },
      {
        id: 'case-bootstrap',
        project_id: projectId,
        source_agent_run_id: 'run-bootstrap',
        case_key: 'bootstrap',
        source_kind: 'GOVERNANCE_REMEDIATION_KNOWLEDGE',
        problem_type: 'REFERENCE',
        context: {},
        decision_status: 'VERIFIED',
        outcome_status: 'VERIFIED',
        effectiveness: '1',
        confidence: '1',
        evidence: { metadata: { synthetic_bootstrap: true } },
        status: 'ACTIVE',
        occurred_at: '2026-09-08T12:00:00Z',
      },
      {
        id: 'case-no-run',
        project_id: projectId,
        source_agent_run_id: null,
        case_key: 'no-run',
        source_kind: 'REFERENCE',
        problem_type: 'REFERENCE',
        context: {},
        decision_status: 'VERIFIED',
        outcome_status: 'VERIFIED',
        effectiveness: '1',
        confidence: '1',
        evidence: {},
        status: 'ACTIVE',
        occurred_at: '2026-09-08T12:30:00Z',
      },
    ]
  },
})

assert.deepEqual(provider.capabilities, {
  working: true,
  episodic: true,
  semantic: false,
  procedural: false,
  performance: false,
  forbidden: false,
})

const records = await provider.retrieve({
  projectId: ` ${projectId} `,
  classes: ['working', 'episodic', 'working'],
  agentRunId: ' run-1 ',
  limit: 20,
})

assert.equal(workingCalls.length, 1)
assert.equal(workingCalls[0].projectId, projectId)
assert.equal(workingCalls[0].agentRunId, 'run-1')
assert.equal(episodicCalls.length, 1)
assert.deepEqual(records.map((record) => record.id), ['case-verified', 'working-active'])
assert.equal(records[0].class, 'episodic')
assert.equal(records[0].evidence.source, 'agent.agent_learning_cases')
assert.equal(records[0].evidence.verified, true)
assert.equal(records[0].evidence.syntheticBootstrap, false)
assert.equal('recommendation' in records[0].content, false, 'AI recommendation prose must not become memory authority')
assert.equal(records[1].class, 'working')
assert.equal(records[1].evidence.verified, false, 'working context is not verified enterprise truth')
assert.equal(records[1].expiresAt, '2999-01-01T00:00:00Z')

await assert.rejects(
  provider.retrieve({ projectId, classes: ['working'] }),
  /agentRunId for working memory is required/,
)
await assert.rejects(
  provider.retrieve({ projectId, classes: ['semantic'] }),
  /does not support requested class: semantic/,
)
await assert.rejects(
  provider.retrieve({ projectId, classes: ['forbidden'] }),
  /does not support requested class: forbidden/,
)
await assert.rejects(
  provider.retrieve({ projectId, classes: [] }),
  /At least one memory class is required/,
)
await assert.rejects(
  provider.retrieve({ projectId, classes: ['episodic'], limit: 0 }),
  /limit must be a positive integer/,
)

console.log('ADR-006 MemoryProvider behavior verified.')
