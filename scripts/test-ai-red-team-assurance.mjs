import assert from 'node:assert/strict'
const { evaluateAIRedTeamEvidence, REQUIRED_AI_RED_TEAM_SCENARIOS } = await import('../lib/ai-assurance/red-team.ts')

const now=Date.parse('2026-09-12T12:00:00Z')
const target={projectId:'project-1',aiSystemVersionId:'system-version-1',sourceCommitSha:'a'.repeat(40),deploymentId:'dpl-prod-1'}
assert.deepEqual(evaluateAIRedTeamEvidence([],target,now),{state:'NOT_MEASURED',blockers:['NO_RED_TEAM_EVIDENCE']})
assert.deepEqual(evaluateAIRedTeamEvidence([], {...target, deploymentId:''}, now), {state:'NOT_MEASURED',blockers:['RELEASE_TARGET_INCOMPLETE']})

const base={
  observedAt:'2026-09-12T11:00:00Z',productionRepresentative:true,...target,
  evaluatorVersion:'red-team-v2',passed:true,authorityEscalated:false,crossProjectLeak:false,toolBoundaryViolation:false,
  fabricatedAuthoritativeEvidence:false,sensitiveDataExposed:false,policyBypassed:false,evidenceRefs:['evaluation:1']
}
const pass=REQUIRED_AI_RED_TEAM_SCENARIOS.map((scenarioId)=>({
  ...base,scenarioId,
  ...(scenarioId==='ABSTENTION_FAILURE'?{expectedAbstain:true,actualAbstain:true}:{}),
}))
assert.equal(evaluateAIRedTeamEvidence(pass,target,now).state,'PASS')

const previewOnly=pass.map((row)=>({...row,productionRepresentative:false}))
assert(evaluateAIRedTeamEvidence(previewOnly,target,now).blockers.includes('SCENARIO_PROMPT_INJECTION_NOT_MEASURED_FOR_TARGET'))

for (const [field, blocker] of [
  ['authorityEscalated','AUTHORITY_ESCALATION'],['crossProjectLeak','CROSS_PROJECT_LEAK'],['toolBoundaryViolation','TOOL_BOUNDARY_VIOLATION'],
  ['fabricatedAuthoritativeEvidence','FABRICATED_AUTHORITY_EVIDENCE'],['sensitiveDataExposed','SENSITIVE_DATA_EXPOSED'],['policyBypassed','POLICY_BYPASS']
]) {
  const rows=pass.map((row)=>row.scenarioId==='PROMPT_INJECTION'?{...row,[field]:true}:row)
  assert(evaluateAIRedTeamEvidence(rows,target,now).blockers.includes(`SCENARIO_PROMPT_INJECTION_${blocker}`))
}

const stale=pass.map((row)=>({...row,observedAt:'2026-09-10T00:00:00Z'}))
assert(evaluateAIRedTeamEvidence(stale,target,now).blockers.includes('SCENARIO_PROMPT_INJECTION_EVIDENCE_STALE'))
const future=pass.map((row)=>({...row,observedAt:'2026-09-12T12:10:01Z'}))
assert(evaluateAIRedTeamEvidence(future,target,now).blockers.includes('SCENARIO_PROMPT_INJECTION_TIMESTAMP_FUTURE'))
const noRefs=pass.map((row)=>row.scenarioId==='FABRICATED_EVIDENCE'?{...row,evidenceRefs:[]}:row)
assert(evaluateAIRedTeamEvidence(noRefs,target,now).blockers.includes('SCENARIO_FABRICATED_EVIDENCE_EVIDENCE_REFS_MISSING'))
const abstentionMismatch=pass.map((row)=>row.scenarioId==='ABSTENTION_FAILURE'?{...row,actualAbstain:false}:row)
assert(evaluateAIRedTeamEvidence(abstentionMismatch,target,now).blockers.includes('SCENARIO_ABSTENTION_FAILURE_ABSTENTION_MISMATCH'))

for (const [field, blocker] of [
  ['projectId','PROJECT_BINDING_DRIFT'],['aiSystemVersionId','AI_SYSTEM_VERSION_BINDING_DRIFT'],
  ['sourceCommitSha','SOURCE_COMMIT_BINDING_DRIFT'],['deploymentId','DEPLOYMENT_BINDING_DRIFT']
]) {
  const rows=pass.map((row)=>row.scenarioId==='PROMPT_INJECTION'?{...row,[field]:field==='sourceCommitSha'?'b'.repeat(40):'other'}:row)
  const result=evaluateAIRedTeamEvidence(rows,target,now)
  assert(result.blockers.includes(`SCENARIO_PROMPT_INJECTION_${blocker}`))
  assert(result.blockers.includes('SCENARIO_PROMPT_INJECTION_NOT_MEASURED_FOR_TARGET'))
}

const mixedRelease=[...pass,{...pass[0],deploymentId:'dpl-other'}]
assert(evaluateAIRedTeamEvidence(mixedRelease,target,now).blockers.includes('SCENARIO_PROMPT_INJECTION_DEPLOYMENT_BINDING_DRIFT'))

console.log('AI red-team assurance negative/failure and release-binding tests passed.')
