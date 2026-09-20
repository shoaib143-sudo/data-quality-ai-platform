import assert from 'node:assert/strict'
import fs from 'node:fs'

const state = fs.readFileSync('lib/ai/pgcl-command-center-state.ts', 'utf8')
for (const invariant of [
  "from('learning_candidates')",
  ".eq('candidate_type', 'POSITIVE_CASE')",
  "from('positive_learning_cases')",
  "from('positive_learning_case_reviews')",
  "from('positive_learning_case_occurrences')",
  "from('positive_learning_case_usages')",
  "from('agent_learning_cases')",
  ".eq('source_kind', 'PGCL_POSITIVE_CASE')",
  ".eq('project_id', projectId)",
  'GOVERNED_AGENT_KEYS',
  'agentCoverage',
  'agentsRepresented',
  'production_eligible',
  'learning_provenance_recorded_at',
  'productionEligibleCount',
  'nonProductionOrUnclassified',
  'occurrenceEvents',
  'usageEvents',
  'succeeded',
  'failed',
  'contextOnly: true',
  'mayAuthorizeAction: false',
  'automaticPromotionAllowed: false',
  'adminReviewRequired: true',
  'currentPolicyReevaluationRequired: true',
]) {
  assert.ok(state.includes(invariant), `missing PGCL Command Center invariant: ${invariant}`)
}

for (const forbidden of [
  '.insert(',
  '.update(',
  '.delete(',
  '.upsert(',
  '.rpc(',
  'review_positive_learning_case',
  'create_positive_learning_case',
  'activate_learning_candidate',
  'rollback_learning_candidate',
]) {
  assert.equal(
    state.includes(forbidden),
    false,
    `PGCL Command Center projection must remain read-only: ${forbidden}`,
  )
}

const page = fs.readFileSync('app/admin/ai-command-center/page.tsx', 'utf8')
for (const invariant of [
  'readPgclCommandCenterState',
  'Positive-case learning feedback loop',
  '8 agents represented',
  'Context authority:',
  'Action authorization:',
  'Auto-promotion:',
  'Admin review:',
  'Current policy:',
  'pgcl.agentCoverage.map',
  'agent.approvedCount',
  'agent.promotedActiveCount',
  'agent.succeededCount',
  'agent.failedCount',
  'candidate.reviewStatus',
  'candidate.productionEligible',
  'pgcl.counts.productionEligible',
  'pgcl.counts.nonProductionOrUnclassified',
  'agent.productionEligibleCount',
  'candidate.occurrenceCount',
  'candidate.promotedLearningCaseId',
  'candidate.usageCount',
  'candidate.succeededCount',
  'candidate.failedCount',
  'candidate.averageRelevance',
]) {
  assert.ok(page.includes(invariant), `missing PGCL Command Center UI invariant: ${invariant}`)
}

for (const forbidden of [
  'reviewPositiveLearningCase(',
  'createPositiveLearningCase(',
  'activateGovernedLearningCandidate(',
  'rollbackGovernedLearningCandidate(',
]) {
  assert.equal(
    page.includes(forbidden),
    false,
    `PGCL Command Center must not expose a mutation action: ${forbidden}`,
  )
}

console.log('PGCL Command Center observability is project-scoped, outcome-aware, read-only, and non-authoritative.')
