import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  assertAuthenticatedLearningEvaluator,
  assertLearningEvaluatorAssignment,
} from '../lib/agents/learning-evaluation-authorization.ts'

const authorization = fs.readFileSync('lib/auth/authorize.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20261020100000_agent_learning_evaluate_capability.sql', 'utf8')
const service = fs.readFileSync('lib/agents/governed-learning-evaluation-service.ts', 'utf8')
const genericPolicy = fs.readFileSync('lib/governance/agent-policy-v2.ts', 'utf8')
const genericMap = fs.readFileSync('lib/governance/agent-authorization.ts', 'utf8')

assert.match(authorization, /\| 'agent\.learning\.evaluate'/)
assert.match(migration, /where role_key = 'DATA_GOVERNANCE_ADMIN'/)
assert.match(migration, /select distinct capability/)
assert.match(migration, /where 'agent\.learning\.evaluate' = any\(capabilities\)\s+and role_key <> 'DATA_GOVERNANCE_ADMIN'/)
assert.match(migration, /raise exception 'agent\.learning\.evaluate may only be assigned to DATA_GOVERNANCE_ADMIN'/)

const recordStart = service.indexOf('export async function recordLearningEvaluationDecision')
const recordEnd = service.indexOf('\nexport async function loadLearningReleaseAdmission', recordStart)
assert.notEqual(recordStart, -1)
assert.notEqual(recordEnd, -1)
const recordBody = service.slice(recordStart, recordEnd)
const policyRead = recordBody.indexOf(".from('learning_evaluation_policies')")
const capabilityGate = recordBody.indexOf("authorizeProject(authenticatedUser.id, policy.projectId, 'agent.learning.evaluate')")
const persistence = recordBody.indexOf("rpc('record_learning_evaluation_result'")
assert.ok(policyRead >= 0 && capabilityGate > policyRead && persistence > capabilityGate, 'persisted policy binding and authorization must precede service-role persistence')
assert.match(recordBody, /const authenticatedUser = await requireApiUser\(\)/)
assert.match(recordBody, /authenticatedUser\.id, policy\.projectId, 'agent\.learning\.evaluate'/)
assert.match(recordBody, /policyEvaluatorActorId: policy\.evaluatorActorId/)
assert.match(recordBody, /p_recorded_by: authenticatedUser\.id/)

const reviewer = 'a1234567-89ab-4cde-8fab-123456789abc'
assert.equal(assertAuthenticatedLearningEvaluator({
  authenticatedUserId: reviewer,
  policyEvaluatorActorId: reviewer.toUpperCase(),
  resultEvaluatorActorId: reviewer,
}), reviewer)
assert.throws(() => assertAuthenticatedLearningEvaluator({
  authenticatedUserId: reviewer,
  policyEvaluatorActorId: 'b1234567-89ab-4cde-8fab-123456789abc',
  resultEvaluatorActorId: reviewer,
}), /must match/)
assert.throws(() => assertAuthenticatedLearningEvaluator({
  authenticatedUserId: reviewer,
  policyEvaluatorActorId: reviewer,
  resultEvaluatorActorId: 'caller-claimed-reviewer',
}), /canonical UUID/)
assert.deepEqual(assertLearningEvaluatorAssignment({
  proposerUserId: 'b1234567-89ab-4cde-8fab-123456789abc',
  evaluatorUserId: reviewer.toUpperCase(),
}), { proposerUserId: 'b1234567-89ab-4cde-8fab-123456789abc', evaluatorUserId: reviewer })
assert.throws(() => assertLearningEvaluatorAssignment({
  proposerUserId: reviewer,
  evaluatorUserId: reviewer.toUpperCase(),
}), /must be different/)

assert.ok(!genericPolicy.includes('agent.learning.evaluate'), 'evaluation review must not become a generic execution action')
assert.ok(!genericMap.includes('agent.learning.evaluate'), 'evaluation review must not inherit generic agent action routing')

const registerStart = service.indexOf('export async function registerLearningEvaluationPolicy')
const registerEnd = service.indexOf('\nexport async function recordLearningEvaluationDecision', registerStart)
const registerBody = service.slice(registerStart, registerEnd)
assert.match(registerBody, /const proposer = await requireApiUser\(\)/)
assert.match(registerBody, /proposerUserId: proposer\.id/)
assert.match(registerBody, /authorizeProject\(assignment\.proposerUserId, policy\.projectId, 'agent\.admin'\)/)
assert.match(registerBody, /admin\.auth\.admin\.getUserById\(assignment\.evaluatorUserId\)/)
assert.match(registerBody, /authorizeProject\(assignment\.evaluatorUserId, policy\.projectId, 'agent\.learning\.evaluate'\)/)

console.log('PASS evaluator capability is catalogued, narrowly role-assigned, and checked before evaluation writes')
console.log('PASS forged, mismatched and malformed evaluator identities are rejected against the persisted policy')
console.log('PASS proposer and evaluator assignments require distinct canonical user UUIDs')
console.log('PASS evaluator capability is not exposed as a generic agent execution action')
