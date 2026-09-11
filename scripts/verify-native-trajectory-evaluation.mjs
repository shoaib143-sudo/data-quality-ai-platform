import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const evaluator = readFileSync('lib/agents/runtime/native-trajectory-evaluation.ts','utf8')
const supervisor = readFileSync('lib/agents/runtime/native-supervisor-service.ts','utf8')
const route = readFileSync('app/api/agents/runs/[runId]/evaluation/route.ts','utf8')

function has(source, token, label) { assert.ok(source.includes(token), `${label} missing: ${token}`) }

has(evaluator, "evaluator_type: 'NATIVE_TRAJECTORY'", 'native trajectory evaluator type')
has(evaluator, "evaluator_version: '1.0'", 'native trajectory evaluator version')
has(evaluator, "model_judgment_used: false", 'deterministic authority boundary')
has(evaluator, "DETERMINISTIC_RUNTIME_EVIDENCE", 'runtime evidence authority')
has(evaluator, "from('agent_supervisor_events')", 'append-only supervisor evidence source')
has(evaluator, "from('agent_runs')", 'child run evidence source')
has(evaluator, "planHashes.size !== 1", 'single plan hash invariant')
has(evaluator, "event.event_type === 'PLAN_SUCCEEDED'", 'terminal success evidence')
has(evaluator, "event.event_type === 'PLAN_FAILED'", 'terminal failure evidence')
has(evaluator, "step_coverage", 'coverage dimension')
has(evaluator, "evidence_integrity", 'evidence integrity dimension')
has(evaluator, "recovery_effectiveness", 'recovery dimension')
has(evaluator, "retry_efficiency", 'retry efficiency dimension')
has(evaluator, "completion * 0.35", 'weighted deterministic score')
assert.equal(evaluator.includes('generateText('), false, 'trajectory evaluator must not call a model')
assert.equal(evaluator.includes('generateObject('), false, 'trajectory evaluator must not call a model')

const successEval = supervisor.indexOf('const trajectoryEvaluation = await evaluateNativeSupervisorTrajectory(supervisorRun.id)')
const successClose = supervisor.indexOf("status: 'SUCCEEDED'", successEval)
assert.ok(successEval >= 0 && successClose > successEval, 'trajectory evaluation must persist before successful supervisor closure')
const failedEval = supervisor.indexOf('const trajectoryEvaluation = await evaluateNativeSupervisorTrajectory(supervisorRun.id)', successEval + 1)
const failedClose = supervisor.indexOf("status: 'FAILED'", failedEval)
assert.ok(failedEval > successEval && failedClose > failedEval, 'trajectory evaluation must persist before failed supervisor closure')
has(supervisor, 'trajectory_evaluation_id: trajectoryEvaluation.id', 'trajectory evaluation evidence reference')
has(supervisor, 'trajectory_score: trajectoryEvaluation.score', 'trajectory score projection')

has(route, 'export async function GET', 'evaluation read endpoint')
has(route, "authorizeProject(user.id, run.project_id, 'agent.execute')", 'evaluation project authorization')
has(route, "from('agent_evaluations')", 'evaluation ledger read')

console.log('Native trajectory evaluation verified.')
