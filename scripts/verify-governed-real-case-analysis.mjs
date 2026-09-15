import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const analysisSource = fs.readFileSync(path.join(root, 'lib/data-quality/governed-real-case-analysis.ts'), 'utf8')
const serviceSource = fs.readFileSync(path.join(root, 'lib/data-quality/governed-real-case-analysis-service.ts'), 'utf8')
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260915111000_governed_real_case_analysis_hardening.sql'), 'utf8')

for (const required of [
  "REAL_CASE_ANALYSIS_VERSION = 'real-case-analysis-v1'",
  "case 'WORKED':",
  "case 'FAILED':",
  "case 'VERIFIED':",
  "return 'ADJUDICATED'",
  "return 'UNADJUDICATED'",
  "analysisType: 'REAL_CASE_OUTCOME_DISTRIBUTION'",
  "predictive_probability_exposed: false",
  "source: 'agent.agent_learning_cases'",
]) {
  assert.ok(analysisSource.includes(required), `Real-case analysis contract is missing: ${required}`)
}

assert.ok(
  !analysisSource.includes("case 'VERIFIED':\n      return 'SUCCESS'"),
  'A VERIFIED outcome status must not be silently converted into outcome success.',
)

for (const required of [
  ".eq('project_id', input.projectId)",
  ".eq('status', 'ACTIVE')",
  ".gte('occurred_at', input.windowStart)",
  ".lte('occurred_at', input.windowEnd)",
  ".lte('created_at', input.evidenceCutoffAt)",
  ".lte('updated_at', input.evidenceCutoffAt)",
  "onConflict: 'learning_case_id,evidence_cutoff_at'",
  ".from('analysis_evidence_envelopes')",
]) {
  assert.ok(serviceSource.includes(required), `Real-case service boundary is missing: ${required}`)
}

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
