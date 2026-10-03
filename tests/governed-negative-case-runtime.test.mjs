import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const runtime = fs.readFileSync('lib/agents/governed-negative-case-learning-runtime.ts','utf8')
const worker = fs.readFileSync('lib/agents/governance-job-worker.ts','utf8')
const service = fs.readFileSync('lib/agents/governed-negative-case-learning-service.ts','utf8')
const api = fs.readFileSync('app/api/admin/learning-cases/[candidateId]/negative-review/route.ts','utf8')
const page = fs.readFileSync('app/admin/learning-cases/page.tsx','utf8')
const manager = fs.readFileSync('app/admin/learning-cases/negative-learning-case-review-manager.tsx','utf8')
const migration = fs.readFileSync('supabase/migrations/20261003130000_governed_learning_case_registry.sql','utf8')
const precedent = fs.readFileSync('lib/agents/pgcl-approved-precedent.ts','utf8')
const memory = fs.readFileSync('lib/agents/agent-memory-learning.ts','utf8')
const profilingJob = fs.readFileSync('lib/agents/run-profiling-job.ts','utf8')
const dqWorker = fs.readFileSync('lib/orchestration/worker.ts','utf8')
const supervisor = fs.readFileSync('lib/agents/runtime/native-supervisor-service.ts','utf8')
const negativeService = fs.readFileSync('lib/agents/governed-negative-case-learning-service.ts','utf8')
const governedOutcome = fs.readFileSync('lib/governance/governed-outcome-learning.ts','utf8')

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


test('verified governed outcomes close the negative learning feedback loop', () => {
  assert.match(negativeService, /reconcileNegativeLearningCaseUsagesFromGovernedOutcome/)
  assert.match(negativeService, /AUTHORITATIVE_GOVERNED_OUTCOME/)
  assert.match(negativeService, /usage_status', 'APPLIED'/)
  assert.match(governedOutcome, /reconcileNegativeLearningCaseUsagesFromGovernedOutcome/)
})


test('retrieval recording never downgrades terminal learning usage state', () => {
  const positiveService = fs.readFileSync('lib/agents/proactive-governed-case-learning-service.ts', 'utf8')
  const negativeService = fs.readFileSync('lib/agents/governed-negative-case-learning-service.ts', 'utf8')
  for (const source of [positiveService, negativeService]) {
    assert.match(source, /ignoreDuplicates: true/)
    assert.match(source, /usage_status: 'RETRIEVED'/)
  }
})


test('unrelated failures do not collapse into one negative learning case', () => {
  const contract = fs.readFileSync('lib/agents/governed-negative-case-learning.ts', 'utf8')
  assert.match(contract, /negativeCaseSignature/)
  assert.match(contract, /useCaseKey: \`\$\{input\.agentKey\}:\$\{skillKey\}:\$\{negativeCaseSignature\(problem\)\}\`/)
  assert.doesNotMatch(contract, /useCaseKey: \`\$\{input\.agentKey\}:\$\{skillKey\}:failure-pattern\`/)
  assert.match(migration, /nc\.problem_signature = btrim\(p_problem_signature\)/)
})
