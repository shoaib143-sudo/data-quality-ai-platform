import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { buildGovernedLearningCandidateDraftsFromScorecard } = await import('../lib/agents/governed-learning-candidates.ts')

const metric = (overrides = {}) => ({
  evaluationType: 'AGENT_SKILL',
  capability: 'agent_skill:data_quality_agent:quality_rule_analysis',
  metricName: 'grounding',
  sampleCount: 10,
  scoredCount: 10,
  passCount: 8,
  failCount: 2,
  averageScore: 0.8,
  evidenceResultIds: ['eval-b', 'eval-a'],
  lastObservedAt: '2026-09-20T00:00:00Z',
  ...overrides,
})

const drafts = buildGovernedLearningCandidateDraftsFromScorecard({
  projectId: 'project-1',
  agentKey: 'data_quality_agent',
  skillKey: 'quality_rule_analysis',
  metrics: [
    metric(),
    metric({
      metricName: 'evidence_sufficiency',
      failCount: 1,
      passCount: 9,
      evidenceResultIds: ['eval-c', 'eval-a'],
    }),
    metric({
      metricName: 'tool_correctness',
      failCount: 1,
      passCount: 9,
      evidenceResultIds: ['eval-d'],
    }),
  ],
  baselineVersion: 'quality-rule-analysis-v1',
  candidateVersion: 'quality-rule-analysis-v2-candidate',
  evidenceCutoffAt: '2026-09-20T00:05:00Z',
})

assert.equal(drafts.length, 2, 'evaluation failures should be grouped by governed improvement category')
const evidenceCandidate = drafts.find((draft) => draft.category === 'EVIDENCE_GROUNDING')
assert.ok(evidenceCandidate)
assert.deepEqual(evidenceCandidate.evidenceRefs, ['eval-a', 'eval-b', 'eval-c'])
assert.equal(evidenceCandidate.initialStatus, 'PROPOSED')
assert.equal(evidenceCandidate.mayAutoApply, false)
assert.equal(evidenceCandidate.maySelfPromote, false)
assert.equal(evidenceCandidate.mayExpandToolAuthority, false)
assert.equal(evidenceCandidate.mayChangeMutationBoundary, false)
assert.equal(evidenceCandidate.requiresHumanReview, true)
assert.equal(evidenceCandidate.currentAuthorizationRequiredAtRelease, true)

const toolCandidate = drafts.find((draft) => draft.category === 'TOOL_CONTRACT')
assert.ok(toolCandidate)
assert.deepEqual(toolCandidate.evidenceRefs, ['eval-d'])
assert.ok(toolCandidate.candidateKey.includes('data_quality_agent:quality_rule_analysis:TOOL_CONTRACT'))

const repeated = buildGovernedLearningCandidateDraftsFromScorecard({
  projectId: 'project-1',
  agentKey: 'data_quality_agent',
  skillKey: 'quality_rule_analysis',
  metrics: [
    metric({ evidenceResultIds: ['eval-a', 'eval-b'] }),
    metric({
      metricName: 'evidence_sufficiency',
      failCount: 1,
      passCount: 9,
      evidenceResultIds: ['eval-a', 'eval-c'],
    }),
  ],
  baselineVersion: 'quality-rule-analysis-v1',
  candidateVersion: 'quality-rule-analysis-v2-candidate',
  evidenceCutoffAt: '2026-09-20T00:05:00Z',
})
assert.equal(
  repeated[0].candidateKey,
  evidenceCandidate.candidateKey,
  'candidate identity must be deterministic regardless of evidence ordering',
)

assert.deepEqual(buildGovernedLearningCandidateDraftsFromScorecard({
  projectId: 'project-1',
  agentKey: 'data_quality_agent',
  skillKey: 'quality_rule_analysis',
  metrics: [metric({ failCount: 0, passCount: 10 })],
  baselineVersion: 'v1',
  candidateVersion: 'v2',
  evidenceCutoffAt: '2026-09-20T00:05:00Z',
}), [])

assert.throws(() => buildGovernedLearningCandidateDraftsFromScorecard({
  projectId: 'project-1',
  agentKey: 'data_quality_agent',
  skillKey: 'quality_rule_analysis',
  metrics: [metric({ evidenceResultIds: [] })],
  baselineVersion: 'v1',
  candidateVersion: 'v2',
  evidenceCutoffAt: '2026-09-20T00:05:00Z',
}), /require persisted evaluation evidence/)

assert.throws(() => buildGovernedLearningCandidateDraftsFromScorecard({
  projectId: 'project-1',
  agentKey: 'data_quality_agent',
  skillKey: 'quality_rule_analysis',
  metrics: [metric()],
  baselineVersion: 'same',
  candidateVersion: 'same',
  evidenceCutoffAt: '2026-09-20T00:05:00Z',
}), /must differ/)

assert.throws(() => buildGovernedLearningCandidateDraftsFromScorecard({
  projectId: 'project-1',
  agentKey: 'executive_agent',
  skillKey: 'quality_rule_analysis',
  metrics: [metric({ capability: 'agent_skill:executive_agent:quality_rule_analysis' })],
  baselineVersion: 'v1',
  candidateVersion: 'v2',
  evidenceCutoffAt: '2026-09-20T00:05:00Z',
}), /not authorized/)

const source = fs.readFileSync('lib/agents/governed-learning-candidates.ts', 'utf8')
for (const invariant of [
  "mayAutoApply: false",
  "maySelfPromote: false",
  "mayExpandToolAuthority: false",
  "mayChangeMutationBoundary: false",
  "requiresHumanReview: true",
  "currentAuthorizationRequiredAtRelease: true",
  "SELF_PROMOTE_TO_PRODUCTION",
  "EXPAND_TOOL_AUTHORITY",
  "CHANGE_MUTATION_BOUNDARY",
]) {
  assert.ok(source.includes(invariant), `missing governed learning invariant: ${invariant}`)
}
assert.equal(/chain[-_ ]?of[-_ ]?thought/i.test(source), false)
assert.equal(/hidden[-_ ]?reasoning/i.test(source), false)

const serviceSource = fs.readFileSync('lib/agents/governed-learning-candidate-service.ts', 'utf8')
for (const invariant of [
  'createGovernedLearningCandidatesFromScorecard',
  'readAgentSkillScorecard',
  'buildGovernedLearningCandidateDraftsFromScorecard',
  'persistGovernedLearningCandidate',
]) {
  assert.ok(serviceSource.includes(invariant), `missing scorecard-to-candidate service integration: ${invariant}`)
}

const migration = fs.readFileSync('supabase/migrations/20260920010000_governed_learning_candidates.sql', 'utf8')
for (const invariant of [
  'create table if not exists agent.learning_candidates',
  'create table if not exists agent.learning_candidate_evidence',
  'create table if not exists agent.learning_candidate_transitions',
  'create or replace function agent.create_learning_candidate',
  'create or replace function agent.transition_learning_candidate',
  "evaluation_type = 'AGENT_SKILL'",
  "production_eligible",
  "may_auto_apply boolean not null default false check (may_auto_apply = false)",
  "may_self_promote boolean not null default false check (may_self_promote = false)",
  "may_expand_tool_authority boolean not null default false check (may_expand_tool_authority = false)",
  "may_change_mutation_boundary boolean not null default false check (may_change_mutation_boundary = false)",
  "requires_human_review boolean not null default true check (requires_human_review = true)",
  "current_authorization_required_at_release boolean not null default true check (current_authorization_required_at_release = true)",
  "p_target_status = 'EVIDENCE_READY'",
  "p_target_status = 'REJECTED'",
  'revoke all on agent.learning_candidates from public, anon, authenticated, service_role',
  'grant select on agent.learning_candidates to authenticated, service_role',
]) {
  assert.ok(migration.includes(invariant), `missing persistence invariant: ${invariant}`)
}
assert.equal(
  migration.includes("p_target_status = 'ACTIVE'"),
  false,
  'first increment must not expose a direct ACTIVE transition',
)
assert.equal(
  migration.includes("p_target_status = 'APPROVED_FOR_CONTROLLED_RELEASE'"),
  false,
  'first increment must not expose an approval transition before benchmark/review controls exist',
)

console.log('Governed learning candidates are deterministic, evidence-bound, project-scoped, non-self-promoting, and fail closed before release authority.')
