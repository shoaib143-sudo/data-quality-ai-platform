import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const analysisSource = fs.readFileSync(path.join(root, 'lib/data-quality/governed-real-case-analysis.ts'), 'utf8')
const serviceSource = fs.readFileSync(path.join(root, 'lib/data-quality/governed-real-case-analysis-service.ts'), 'utf8')
const routeSource = fs.readFileSync(path.join(root, 'app/api/analytics/governed-real-cases/route.ts'), 'utf8')
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260915111000_governed_real_case_analysis_hardening.sql'), 'utf8')

for (const required of [
  "REAL_CASE_ANALYSIS_VERSION = 'real-case-analysis-v1'",
  "case 'WORKED':",
  "case 'FAILED':",
  "case 'VERIFIED':",
  "return 'ADJUDICATED'",
  "return 'UNADJUDICATED'",
  "case 'EFFECTIVE':",
  "case 'INEFFECTIVE':",
  "case 'PARTIAL':",
  "canonicalOutcomeFromVerifiedActionOutcome",
  "matchUniqueVerifiedOutcome",
  "analysisType: 'REAL_CASE_OUTCOME_DISTRIBUTION'",
  "predictive_probability_exposed: false",
  "canonical_source: 'agent.agent_learning_cases'",
  "verified_outcome_enrichment_source: 'governance.governed_action_outcomes'",
]) {
  assert.ok(analysisSource.includes(required), `Real-case analysis contract is missing: ${required}`)
}

assert.ok(
  !analysisSource.includes("case 'VERIFIED':\n      return 'SUCCESS'"),
  'A VERIFIED status must not be silently converted into outcome success.',
)
assert.ok(
  analysisSource.includes("normalized(row.verification_state) !== 'VERIFIED' || !row.verified_at"),
  'Governed action outcomes must be verified before they can enrich a canonical learning case.',
)
assert.ok(
  analysisSource.includes('return matches.length === 1 ? matches[0] : null'),
  'Ambiguous outcome correlation must fail closed instead of duplicating or guessing case identity.',
)
assert.ok(
  analysisSource.includes("normalized(verifiedOutcome.execution_state) !== 'NOT_EXECUTED'"),
  'Execution state may only contribute execution evidence and must remain separate from outcome classification.',
)

for (const required of [
  ".eq('project_id', input.projectId)",
  ".eq('status', 'ACTIVE')",
  ".gte('occurred_at', input.windowStart)",
  ".lte('occurred_at', input.windowEnd)",
  ".lte('created_at', input.evidenceCutoffAt)",
  ".lte('updated_at', input.evidenceCutoffAt)",
  ".from('governed_action_outcomes')",
  ".eq('verification_state', 'VERIFIED')",
  ".not('source_agent_run_id', 'is', null)",
  ".lte('verified_at', input.evidenceCutoffAt)",
  "onConflict: 'learning_case_id,evidence_cutoff_at'",
  ".from('analysis_evidence_envelopes')",
]) {
  assert.ok(serviceSource.includes(required), `Real-case service boundary is missing: ${required}`)
}

for (const required of [
  'await requireUser()',
  "await authorizeProject(user.id, projectId, 'agent.view')",
  'persist: false',
  'historical_context_never_authorizes_action: true',
  'current_authorization_required: true',
  'predictive_probability_exposed: false',
  'read_request_persists_learning_state: false',
]) {
  assert.ok(routeSource.includes(required), `Governed real-case API boundary is missing: ${required}`)
}

assert.ok(!routeSource.includes('createAdminClient'), 'The public route must not bypass project authorization with a direct admin client.')
assert.ok(!routeSource.includes('persist: true'), 'A read analytics request must not mutate learning state.')

for (const required of [
  'drop constraint if exists learning_case_assessments_case_unique',
  'unique (learning_case_id, evidence_cutoff_at)',
  'foreign key (project_id) references app.projects(id) on delete cascade',
  'enforce_learning_case_assessment_project_scope',
  'c.id = new.learning_case_id',
  'c.project_id = new.project_id',
]) {
  assert.ok(migration.includes(required), `Real-case migration hardening is missing: ${required}`)
}

assert.ok(
  migration.includes('A later evidence cutoff creates a new assessment rather than overwriting prior historical state.'),
  'Assessment history must preserve as-of reproducibility.',
)

console.log('Governed real-case analysis contract verification passed.')
