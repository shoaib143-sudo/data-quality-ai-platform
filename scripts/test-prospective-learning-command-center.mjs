import assert from 'node:assert/strict'
import fs from 'node:fs'

const state = fs.readFileSync('lib/ai/prospective-learning-command-center-state.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260929000200_learning_prospective_outcomes.sql', 'utf8')
const page = fs.readFileSync('app/admin/ai-command-center/learning-governance/page.tsx', 'utf8')

for (const invariant of [
  "rpc('summarize_learning_prospective_outcomes'",
  "authorizeProject(actorUserId, projectId, 'admin.manage')",
  'GOVERNED_AGENT_KEYS',
  'agentCoverage',
  'measuredModes',
  'observedOutcomes',
  'selfPromotionAllowed: false',
  'automaticAuthorityExpansionAllowed: false',
  'Missing agents and modes are deliberately represented as zero evidence',
]) {
  assert.ok(state.includes(invariant), `missing prospective observability invariant: ${invariant}`)
}
for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(', 'activate', 'rollback']) {
  assert.equal(state.includes(forbidden), false, `prospective Command Center must remain read-only: ${forbidden}`)
}
for (const invariant of [
  'readProspectiveLearningCommandCenterState',
  'Prospective results by agent and run mode',
  'prospective.agentCoverage.map',
  'prospective.summaries.map',
  'Measured agent versions and run modes',
  'No evidence yet',
  'Awaiting the prospective outcome database migration',
  'if (!/PGRST202|42883|',
]) {
  assert.ok(page.includes(invariant), `missing Command Center prospective integration: ${invariant}`)
}
for (const invariant of [
  'create table agent.learning_prospective_outcomes',
  'production_eligible',
  'synthetic_or_test_detected',
  'run_mode',
  'UNCLASSIFIED',
  'collect_learning_prospective_outcome',
  'summarize_learning_prospective_outcomes',
  'UNKNOWN and non-effective outcomes remain in the denominator',
]) {
  assert.ok(migration.includes(invariant), `missing prospective evidence invariant: ${invariant}`)
}

console.log('Prospective learning Command Center coverage is actor-authorized, read-only, and evidence-aware.')
