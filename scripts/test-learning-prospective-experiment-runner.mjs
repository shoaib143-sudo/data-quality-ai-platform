import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import './lib/register-typescript-resolution.mjs'

const { runLearningProspectiveExperiment } = await import('../lib/agents/learning-prospective-experiment-runner.ts')

const IDs = {
  project: '11111111-1111-4111-8111-111111111111',
  policy: '22222222-2222-4222-8222-222222222222',
  candidate: '33333333-3333-4333-8333-333333333333',
  manifest: '44444444-4444-4444-8444-444444444444',
}
const CASES = [
  { caseKey: 'a'.repeat(64), sourceCaseRef: 'case://a' },
  { caseKey: 'b'.repeat(64), sourceCaseRef: 'case://b' },
]

function plan(sampleSize=2) {
  return {
    projectId: IDs.project,
    policyRecordId: IDs.policy,
    candidateId: IDs.candidate,
    datasetManifestId: IDs.manifest,
    policyKey: 'pilot-v1',
    agentKey: 'profiling_agent',
    skillKey: 'profile_evidence_analysis',
    mode: 'GUIDED',
    baselineVersion: 'baseline-v1',
    candidateVersion: 'candidate-v2',
    evaluatorActorId: 'independent-evaluator',
    sampleSize,
    heldOutCases: CASES,
  }
}

function memoryStore(options={}) {
  const attempts = new Map()
  const evaluations = new Map()
  let run = null
  return {
    attempts,evaluations,
    store: {
      async begin(input) {
        run ??= { runId: randomUUID(), expectedCaseCount: plan().sampleSize, input }
        return { runId: run.runId, expectedCaseCount: run.expectedCaseCount, existing: run.input !== input }
      },
      async claimAttempt(input) {
        const key = `${input.caseKey}:${input.arm}`
        let existing = attempts.get(key)
        if (existing) return { ...existing, existing: true }
        const row = {
          attemptId: randomUUID(),
          executionRunId: randomUUID(),
          status: options.preclaimed === key ? 'CLAIMED' : 'CLAIMED',
          evidenceRef: null,
          existing: false,
          attemptKey: input.attemptKey,
        }
        attempts.set(key,row)
        if (options.preclaimed === key) return { ...row, existing: true }
        return row
      },
      async completeAttempt(input) {
        const row = [...attempts.values()].find(item => item.attemptId === input.attemptId)
        assert.ok(row)
        row.status = input.status
        row.evidenceRef = input.evidenceRef
        row.errorCode = input.errorCode
      },
      async loadCaseEvaluation(input) {
        return evaluations.get(input.caseKey) ?? null
      },
      async recordCaseEvaluation(input) {
        const row = { evaluationId: randomUUID(), ...input }
        evaluations.set(input.caseKey,row)
        return row
      },
      async completeRun() {
        if (options.failComplete) throw new Error('incomplete')
      },
    },
  }
}

{
  const mem=memoryStore()
  let executeCalls=0, evaluatorCalls=0
  const result=await runLearningProspectiveExperiment({
    projectId:IDs.project,policyRecordId:IDs.policy,candidateId:IDs.candidate,
    runKey:'synthetic-1',evidenceClass:'SYNTHETIC_REHEARSAL',
    planProvider:{async load(){return plan()}},
    store:mem.store,
    executor:{async execute(input){
      executeCalls+=1
      assert.equal(input.evidenceClass,'SYNTHETIC_REHEARSAL')
      return {evidenceRef:randomUUID()}
    }},
    evaluator:{async evaluate(input){
      evaluatorCalls+=1
      assert.notEqual(input.baselineEvidenceRef,input.candidateEvidenceRef)
      return {
        baselineScore:0.5,candidateScore:0.75,authorityViolation:false,adversarialFailure:false,
        observedAt:'2026-10-02T00:00:00.000Z',
      }
    }},
  })
  assert.equal(executeCalls,4)
  assert.equal(evaluatorCalls,2)
  assert.equal(result.caseCount,2)
  assert.equal(result.baselineScore,0.5)
  assert.equal(result.candidateScore,0.75)
  assert.equal(result.evidenceClass,'SYNTHETIC_REHEARSAL')

  // A completed rerun reuses immutable case evaluations and dispatches nothing.
  executeCalls=0; evaluatorCalls=0
  const resumed=await runLearningProspectiveExperiment({
    projectId:IDs.project,policyRecordId:IDs.policy,candidateId:IDs.candidate,
    runKey:'synthetic-1',evidenceClass:'SYNTHETIC_REHEARSAL',
    planProvider:{async load(){return plan()}},store:mem.store,
    executor:{async execute(){executeCalls+=1;return {evidenceRef:randomUUID()}}},
    evaluator:{async evaluate(){evaluatorCalls+=1;throw new Error('should not evaluate')}},
  })
  assert.equal(executeCalls,0)
  assert.equal(evaluatorCalls,0)
  assert.equal(resumed.caseCount,2)
}

{
  const mem=memoryStore({preclaimed:`${CASES[0].caseKey}:BASELINE`})
  // Seed a durable unresolved claim to emulate a crash after claim / unknown side effect.
  await mem.store.claimAttempt({
    projectId:IDs.project,runId:'seed',caseKey:CASES[0].caseKey,arm:'BASELINE',
    version:'baseline-v1',attemptKey:'sha256:'+'1'.repeat(64),
  })
  let calls=0
  await assert.rejects(runLearningProspectiveExperiment({
    projectId:IDs.project,policyRecordId:IDs.policy,candidateId:IDs.candidate,
    runKey:'recovery',evidenceClass:'SYNTHETIC_REHEARSAL',
    planProvider:{async load(){return plan()}},store:mem.store,
    executor:{async execute(){calls+=1;return {evidenceRef:randomUUID()}}},
    evaluator:{async evaluate(){throw new Error('should not evaluate')}},
  }), {name:'LearningProspectiveRecoveryRequiredError'})
  assert.equal(calls,0,'unresolved claimed attempt must never be blindly re-dispatched')
}

{
  const mem=memoryStore()
  let call=0
  await assert.rejects(runLearningProspectiveExperiment({
    projectId:IDs.project,policyRecordId:IDs.policy,candidateId:IDs.candidate,
    runKey:'failure',evidenceClass:'SYNTHETIC_REHEARSAL',
    planProvider:{async load(){return plan()}},store:mem.store,
    executor:{async execute(){
      call+=1
      if(call===2){const e=new Error('fixture failure');e.name='FixtureProviderFailure';throw e}
      return {evidenceRef:randomUUID()}
    }},
    evaluator:{async evaluate(){throw new Error('should not evaluate incomplete pair')}},
  }), {name:'FixtureProviderFailure'})
  assert.equal([...mem.attempts.values()].some(x=>x.status==='FAILED' && x.errorCode==='FixtureProviderFailure'),true)
}

{
  const mem=memoryStore()
  await assert.rejects(runLearningProspectiveExperiment({
    projectId:IDs.project,policyRecordId:IDs.policy,candidateId:IDs.candidate,
    runKey:'subset',evidenceClass:'SYNTHETIC_REHEARSAL',
    planProvider:{async load(){return plan(1)}},store:mem.store,
    executor:{async execute(){return {evidenceRef:randomUUID()}}},
    evaluator:{async evaluate(){throw new Error('not reached')}},
  }), /complete locked held-out partition/)
}

{
  const mem=memoryStore()
  const same=randomUUID()
  await assert.rejects(runLearningProspectiveExperiment({
    projectId:IDs.project,policyRecordId:IDs.policy,candidateId:IDs.candidate,
    runKey:'same-evidence',evidenceClass:'SYNTHETIC_REHEARSAL',
    planProvider:{async load(){return plan()}},store:mem.store,
    executor:{async execute(){return {evidenceRef:same}}},
    evaluator:{async evaluate(){throw new Error('not reached')}},
  }), /independently addressable/)
}

console.log('Prospective learning experiment orchestration, resume, recovery and failure-path tests passed')
