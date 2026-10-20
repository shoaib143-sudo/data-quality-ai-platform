import assert from 'node:assert/strict'
import './lib/register-typescript-resolution.mjs'

const {runLearningExperiment,runnerHash,learningRunnerExecutionManifestHash}=await import('../lib/agents/learning-experiment-runner.ts')
const {createSyntheticLearningRunnerExecutor}=await import('../lib/agents/learning-runner-synthetic.ts')

const ids={
  run:'11111111-1111-4111-8111-111111111111',
  policyRow:'22222222-2222-4222-8222-222222222222',
  project:'33333333-3333-4333-8333-333333333333',
  candidate:'44444444-4444-4444-8444-444444444444',
  manifest:'55555555-5555-4555-8555-555555555555',
}
const artifact=(ref,bytes)=>({ref,bytes,hash:runnerHash(bytes)})
const policy={
  policyId:'synthetic-policy',projectId:ids.project,candidateId:ids.candidate,
  agentKey:'profiling_agent',skillKey:'profile_evidence_analysis',mode:'GUIDED',
  datasetVersionIds:['dataset-v1'],datasetManifestId:ids.manifest,
  baselineVersion:'1.0',candidateVersion:'2.0',rollbackRef:'agent-definition:baseline',
  evaluatorActorId:'77777777-7777-4777-8777-777777777777',
  proposerActorId:'66666666-6666-4666-8666-666666666666',
  rubricRef:'rubric:v1',calibrationRef:'calibration:v1',
  manifestHash:'sha256:'+'a'.repeat(64),lockedAt:'2026-10-20T00:00:00.000Z',
  primaryMetric:'quality',analysisPlanRef:'analysis:v1',sampleSize:1,minimumGain:0.05,minimumScore:0.6,
  budget:{totalCost:0,perRunCost:0,totalTokens:0,perRunTokens:0,latencyMs:1000},
}
const unsigned={
  runId:ids.run,policyRecordId:ids.policyRow,provenance:'synthetic',policy,
  baseline:artifact('artifact:baseline','{"version":"1.0"}'),
  candidate:artifact('artifact:candidate','{"version":"2.0"}'),
  cases:[{caseKey:'b'.repeat(64),datasetVersionId:'dataset-v1',split:'held_out',input:artifact('artifact:case','{"value":1}')}],
  trainingCaseKeys:['c'.repeat(64)],
}
const plan={...unsigned,executionManifestHash:learningRunnerExecutionManifestHash(unsigned)}
const claims=new Map()
const outcomes=[]
const store={
  async claimDispatch(identity,inputHash){
    const key=`${identity.caseKey}:${identity.arm}`
    if(claims.has(key)) return {status:'completed',outcome:claims.get(key)}
    return {status:'acquired',claimId:identity.arm==='baseline'
      ?'88888888-8888-4888-8888-888888888888':'99999999-9999-4999-8999-999999999999'}
  },
  async completeDispatch(_claimId,outcome){claims.set(`${outcome.identity.caseKey}:${outcome.identity.arm}`,outcome);outcomes.push(outcome)},
  async isCancelled(){return false},
}
const executor=createSyntheticLearningRunnerExecutor()
const result=await runLearningExperiment({
  runId:ids.run,dispatch:true,
  ports:{
    async loadServerPlan(){return plan},
    async authorize(){return {
      projectId:ids.project,policyId:'synthetic-policy',proposerActorId:policy.proposerActorId,evaluatorActorId:policy.evaluatorActorId,
      executeAllowed:true,evaluatorAllowed:true,independenceVerified:true,sourceRemediationAllowed:false,
    }},
    store,execute:executor,
    async verifyCanonicalOutcome(outcome){return outcome.provenance==='synthetic'&&outcome.costUsd==='0'&&outcome.tokens===0},
  },
})
assert.equal(result.status,'COMPLETED')
assert.equal(result.automaticPromotionAllowed,false)
assert.equal(result.outcomes.length,2)
for(const outcome of result.outcomes){
  assert.equal(outcome.provenance,'synthetic')
  assert.equal(outcome.costUsd,'0')
  assert.equal(outcome.tokens,0)
  assert.equal(outcome.reservationId,null)
  assert.equal(outcome.settlementId,null)
  assert.equal(outcome.costEventId,null)
}
assert.equal(outcomes.length,2)

await assert.rejects(
  executor({
    identity:{...result.outcomes[0].identity,arm:'baseline'},
    input:unsigned.cases[0].input,executable:unsigned.baseline,provenance:'prospective',
  }),
  /SYNTHETIC_EXECUTOR_PROSPECTIVE_DENIED/,
)

const replay=await runLearningExperiment({
  runId:ids.run,dispatch:true,
  ports:{
    async loadServerPlan(){return plan},
    async authorize(){return {
      projectId:ids.project,policyId:'synthetic-policy',proposerActorId:policy.proposerActorId,evaluatorActorId:policy.evaluatorActorId,
      executeAllowed:true,evaluatorAllowed:true,independenceVerified:true,sourceRemediationAllowed:false,
    }},
    store,
    async execute(){throw new Error('completed synthetic claims must not redispatch')},
    async verifyCanonicalOutcome(){return true},
  },
})
assert.equal(replay.status,'COMPLETED')
assert.equal(outcomes.length,2,'resume must reuse terminal evidence without redispatch')

console.log('Synthetic learning activation completed at $0 with deterministic resume and no live accounting artifacts')
