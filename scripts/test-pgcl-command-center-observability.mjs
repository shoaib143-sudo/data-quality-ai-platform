import assert from 'node:assert/strict'
import fs from 'node:fs'

const state = fs.readFileSync('lib/ai/pgcl-command-center-state.ts', 'utf8')
for (const invariant of [
  "authorizeProject",
  "readPgclCommandCenterState(projectId: string, actorUserId: string)",
  "authorizeProject(actorUserId, projectId, 'admin.manage')",
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
  'createAdminClient',
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
  "select('candidate_id,learning_case_id,relevance,usage_status,outcome,first_retrieved_at,updated_at')",
  'execution_surface',
  'DIRECT_SPECIALIST',
  'PROFILING_INVESTIGATION',
  'DATA_QUALITY_INVESTIGATION',
  'SUPERVISOR_SPECIALIST',
  'terminal_attribution',
  'AUTHORITATIVE_GOVERNED_OUTCOME',
  'profilingApplications',
  'dataQualityApplications',
  'supervisorApplications',
  'directSpecialistApplications',
  'authoritativeOutcomes',
  'unknownApplicationSurfaces',
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
  'createClient',
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
  'readPgclCommandCenterState(selectedProjectId, user.id)',
  'authorizeProject',
  "'admin.manage'",
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
  'pgcl.counts.profilingApplications',
  'pgcl.counts.dataQualityApplications',
  'pgcl.counts.supervisorApplications',
  'pgcl.counts.directSpecialistApplications',
  'pgcl.counts.authoritativeOutcomes',
  'candidate.executionSurfaces',
  'candidate.authoritativeOutcomeCount',
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

const learningPage = fs.readFileSync('app/admin/ai-command-center/learning-governance/page.tsx', 'utf8')
for (const invariant of [
  'Learning Governance',
  'authorizeProject',
  "'admin.manage'",
  'readGovernedLearningLifecycleCommandCenter',
  'readPgclCommandCenterState(selectedProjectId, user.id)',
  'Learning portfolio by agent',
  'Positive learning cases',
  'Controlled learning lifecycle',
  'Reuse execution surfaces',
  'Direct specialist',
  'Handsfree specialist',
  'Profiling investigation',
  'Data Quality investigation',
  'Verified outcomes',
  'Legacy/unknown surface',
  'candidate.executionSurfaces',
  'candidate.authoritativeOutcomeCount',
  'candidate.transitionCount',
  'candidate.canaryEvidenceCount',
  'candidate.canaryPassCount',
  'candidate.canaryFailureCount',
  'Reusable lessons, raw evidence payloads and hidden reasoning are intentionally not rendered.',
]) {
  assert.ok(learningPage.includes(invariant), `missing dedicated learning governance invariant: ${invariant}`)
}
for (const forbidden of [
  'method="post"',
  "'use server'",
  'reviewPositiveLearningCase(',
  'createPositiveLearningCase(',
  'activateGovernedLearningCandidate(',
  'rollbackGovernedLearningCandidate(',
  'reusableLesson',
  'evidenceRefs',
  'verificationEvidenceRefs',
]) {
  assert.equal(
    learningPage.includes(forbidden),
    false,
    `dedicated learning governance view must remain summary-safe and read-only: ${forbidden}`,
  )
}


const service = fs.readFileSync('lib/agents/proactive-governed-case-learning-service.ts', 'utf8')
for (const invariant of [
  ".select('candidate_id,outcome')",
  'usage.outcome as Record<string, unknown>',
  "terminal_attribution: 'AUTHORITATIVE_GOVERNED_OUTCOME'",
]) {
  assert.ok(service.includes(invariant), `missing PGCL terminal-outcome observability invariant: ${invariant}`)
}

const memory = fs.readFileSync('lib/agents/agent-memory-learning.ts', 'utf8')
assert.ok(memory.includes("execution_surface: 'DIRECT_SPECIALIST'"))

const layout = fs.readFileSync('app/admin/ai-command-center/layout.tsx', 'utf8')
assert.ok(layout.includes("/admin/ai-command-center/learning-governance"))
assert.ok(layout.includes('Learning governance'))

console.log('PGCL Command Center observability is project-scoped, actor-authorized, server-only, outcome-aware, read-only, and non-authoritative.')
