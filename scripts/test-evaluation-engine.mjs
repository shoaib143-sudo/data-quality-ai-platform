import assert from 'node:assert/strict'

const { DurableEvaluationEngine } = await import('../lib/ai/evaluation-engine.ts')

const inserted = []
const scorecardRequests = []
const engine = new DurableEvaluationEngine({
  insert: async (record) => {
    inserted.push(record)
    return { id: '22222222-2222-4222-8222-222222222222' }
  },
  scorecard: async (request) => {
    scorecardRequests.push(request)
    return [{
      evaluation_type: 'RETRIEVAL',
      capability: 'governance_search',
      metric_name: 'citation_correctness',
      sample_count: '10',
      scored_count: '10',
      pass_count: '9',
      fail_count: '1',
      average_score: '0.92',
      evidence_result_ids: [
        '33333333-3333-4333-8333-333333333333',
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
      ],
      last_observed_at: '2026-09-08T15:05:00Z',
    }]
  },
})

const receipt = await engine.record({
  projectId: ' project-a ',
  evaluationType: ' RETRIEVAL ',
  capability: ' governance_search ',
  metricName: ' citation_correctness ',
  score: 0.92,
  pass: true,
  evaluatorType: ' deterministic ',
  evaluatorVersion: ' 1.0 ',
  aiSystemVersionId: ' version-a ',
  evidenceRefs: [' evidence-1 ', 'evidence-1', 'evidence-2'],
  dimensions: { grounding: 0.9 },
  metadata: { dataset: 'verified-corpus-v1' },
  observedAt: '2026-09-08T15:00:00Z',
})

assert.deepEqual(receipt, { resultId: '22222222-2222-4222-8222-222222222222', persisted: true })
assert.equal(inserted.length, 1)
assert.equal(inserted[0].project_id, 'project-a')
assert.equal(inserted[0].evaluation_type, 'RETRIEVAL')
assert.equal(inserted[0].metric_name, 'citation_correctness')
assert.equal(inserted[0].score, 0.92)
assert.equal(inserted[0].evaluator_type, 'deterministic')
assert.deepEqual(inserted[0].evidence_refs, ['evidence-1', 'evidence-2'])
assert.equal(inserted[0].observed_at, '2026-09-08T15:00:00.000Z')

const scorecard = await engine.scorecard({
  projectId: ' project-a ',
  aiSystemVersionId: ' version-a ',
  evaluationType: ' RETRIEVAL ',
})
assert.deepEqual(scorecardRequests[0], {
  projectId: 'project-a',
  aiSystemVersionId: 'version-a',
  evaluationType: 'RETRIEVAL',
  capability: null,
})
assert.deepEqual(scorecard[0], {
  evaluationType: 'RETRIEVAL',
  capability: 'governance_search',
  metricName: 'citation_correctness',
  sampleCount: 10,
  scoredCount: 10,
  passCount: 9,
  failCount: 1,
  averageScore: 0.92,
  evidenceResultIds: [
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
  ],
  lastObservedAt: '2026-09-08T15:05:00Z',
})

await assert.rejects(
  engine.record({ projectId: 'project-a', evaluationType: 'REASONING', metricName: 'grounding', evaluatorType: 'judge' }),
  /requires score or pass evidence/,
)
await assert.rejects(
  engine.record({ projectId: 'project-a', evaluationType: 'REASONING', metricName: 'grounding', evaluatorType: 'judge', score: 1.1 }),
  /score must be between 0 and 1/,
)
await assert.rejects(
  engine.record({ projectId: 'project-a', evaluationType: 'REASONING', metricName: 'grounding', evaluatorType: 'judge', pass: true, metadata: { prompt: 'secret' } }),
  /must not contain prompt, completion, or hidden reasoning payloads/,
)
await assert.rejects(
  engine.record({ projectId: 'project-a', evaluationType: 'REASONING', metricName: 'grounding', evaluatorType: 'judge', pass: true, dimensions: { nested: { chain_of_thought: 'secret' } } }),
  /must not contain prompt, completion, or hidden reasoning payloads/,
)

console.log('ADR-006 EvaluationEngine behavior verified.')
