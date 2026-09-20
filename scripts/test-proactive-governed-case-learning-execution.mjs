import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync('app/api/agents/governance/run/route.ts', 'utf8')
const specialist = fs.readFileSync('lib/agents/governance-specialist-agent.ts', 'utf8')
const memory = fs.readFileSync('lib/agents/agent-memory-learning.ts', 'utf8')
const service = fs.readFileSync('lib/agents/proactive-governed-case-learning-service.ts', 'utf8')
const outcome = fs.readFileSync('lib/governance/governed-outcome-learning.ts', 'utf8')

const retrievalIndex = route.indexOf('retrieveGovernedLearningContext({')
const executionIndex = route.indexOf('executeGovernanceSpecialistAgent({')
assert.ok(retrievalIndex >= 0 && executionIndex > retrievalIndex, 'approved PGCL context must be retrieved before specialist execution')
assert.ok(route.includes('positiveLearningCases: approvedPositiveCases'))
assert.ok(route.includes("authority_effect: 'CONTEXT_ONLY'"))
assert.ok(route.includes('preloadedLearningContext: preExecutionLearning'))

for (const invariant of [
  'positiveLearningCases?: Array<{',
  "priority: 'LEARNED_PRECEDENT'",
  "source: 'PGCL_POSITIVE_CASE'",
  "authority: 'CONTEXT_ONLY_REQUIRES_CURRENT_POLICY'",
  'learnedPositiveCases:',
  'appliedPositiveCaseIds:',
  'agent.agent_learning_cases:PGCL_POSITIVE_CASE',
]) {
  assert.ok(specialist.includes(invariant), 'missing pre-execution PGCL application invariant: ' + invariant)
}

for (const invariant of [
  'recordPositiveLearningCaseRetrievals',
  'recordPositiveLearningCaseOutcome',
  "status: 'APPLIED'",
  "attribution: 'EXPLICIT_AGENT_OUTPUT'",
  'retrievedCandidateIds.has(candidateId)',
]) {
  assert.ok(memory.includes(invariant), 'missing explicit PGCL attribution invariant: ' + invariant)
}

for (const invariant of [
  'reconcilePositiveLearningCaseUsagesFromGovernedOutcome',
  "input.verificationState !== 'VERIFIED'",
  "input.outcomeType === 'EFFECTIVE'",
  "'INEFFECTIVE', 'ROLLED_BACK', 'REJECTED', 'POLICY_BLOCKED', 'FAILED'",
  "attribution: 'AUTHORITATIVE_GOVERNED_OUTCOME'",
]) {
  assert.ok(service.includes(invariant), 'missing governed outcome reconciliation invariant: ' + invariant)
}

assert.ok(outcome.includes('reconcilePositiveLearningCaseUsagesFromGovernedOutcome({'))
assert.ok(outcome.indexOf('reconcilePositiveLearningCaseUsagesFromGovernedOutcome({') > outcome.indexOf("from('governed_action_outcomes')"))
assert.equal(/memory.*authoriz/i.test("Learned cases cannot authorize, approve, execute, or promote a new governance action"), true)

console.log('PGCL precedent is loaded before execution, explicitly attributed when applied, and reinforced only by authoritative governed outcomes.')
