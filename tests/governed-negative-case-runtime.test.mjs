import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const runtime = fs.readFileSync('lib/agents/governed-negative-case-learning-runtime.ts','utf8')
const worker = fs.readFileSync('lib/agents/governance-job-worker.ts','utf8')
const service = fs.readFileSync('lib/agents/governed-negative-case-learning-service.ts','utf8')
const api = fs.readFileSync('app/api/admin/learning-cases/[candidateId]/negative-review/route.ts','utf8')
const page = fs.readFileSync('app/admin/learning-cases/page.tsx','utf8')
const manager = fs.readFileSync('app/admin/learning-cases/negative-learning-case-review-manager.tsx','utf8')
const migration = fs.readFileSync('supabase/migrations/20260929090000_governed_learning_case_registry.sql','utf8')
const precedent = fs.readFileSync('lib/agents/pgcl-approved-precedent.ts','utf8')
const memory = fs.readFileSync('lib/agents/agent-memory-learning.ts','utf8')
const profilingJob = fs.readFileSync('lib/agents/run-profiling-job.ts','utf8')
const dqWorker = fs.readFileSync('lib/orchestration/worker.ts','utf8')
const supervisor = fs.readFileSync('lib/agents/runtime/native-supervisor-service.ts','utf8')

test('terminal durable failures can propose bounded negative learning', () => {
  assert.match(worker, /job\.attempts >= job\.max_attempts/)
  assert.match(worker, /proposeNegativeCaseFromFailedAgentRun/)
  assert.match(runtime, /deriveNegativeLearningCaseFromFailedRun/)
  assert.match(runtime, /persistGovernedNegativeLearningCase/)
})

test('negative learning is limited to supervised and handsfree governed runs', () => {
  assert.match(runtime, /SUPERVISED/)
  assert.match(runtime, /HANDSFREE/)
  assert.match(runtime, /if \(!mode\) return/)
})

test('negative case review requires governance authorization', () => {
  assert.match(api, /authorizeProject/)
  assert.match(api, /authorizeDataGovernanceSuperAdmin/)
  assert.match(service, /APPROVE_NEGATIVE_CASE/)
  assert.match(service, /negative-case review reason is required/)
})

test('negative case review UI exposes source evidence and authority boundary', () => {
  assert.match(page, /NegativeLearningCaseReviewManager/)
  assert.match(manager, /Source run/)
  assert.match(manager, /Negative learning is context only/)
  assert.match(manager, /never grants tool, mutation, approval, or execution authority/)
})


test('approved negative cases have provenance-bearing retrieval and application attribution', () => {
  assert.match(migration, /create table if not exists agent\.negative_learning_case_usages/)
  assert.match(migration, /validate_negative_learning_case_usage/)
  assert.match(migration, /PGCL_NEGATIVE_CASE/)
  assert.match(precedent, /recordNegativeLearningCaseRetrievals/)
  assert.match(precedent, /markPgclAvoidanceCasesApplied/)
  assert.match(precedent, /CONTEXT_ONLY_AVOIDANCE/)
  assert.match(memory, /approvedNegativeCaseMatches/)
  assert.match(memory, /recordNegativeLearningCaseOutcome/)
  assert.match(memory, /current_policy_still_required: true/)
})


test('negative learning is wired to terminal failure surfaces across the eight-agent runtime', () => {
  assert.match(profilingJob, /proposeNegativeCaseFromFailedAgentRun/)
  assert.match(profilingJob, /PROFILING_EXECUTION_FAILED/)
  assert.match(dqWorker, /job\.job_type === 'DATA_QUALITY'/)
  assert.match(dqWorker, /negative-case learning failed safely/)
  assert.match(supervisor, /proposeNegativeCaseFromFailedAgentRun/)
  assert.match(supervisor, /childRunIds/)
  assert.match(supervisor, /input\.learningRunMode \?\? 'HANDSFREE'/)
})
