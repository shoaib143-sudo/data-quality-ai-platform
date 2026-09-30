import test from 'node:test'
import assert from 'node:assert/strict'
import { READINESS_CAPABILITIES } from '../lib/governance/unified-readiness-framework.ts'
import { evaluateReadiness } from '../lib/governance/unified-readiness-engine.ts'
import { planMinimumQuestions } from '../lib/governance/unified-readiness-planner.ts'
import { READINESS_LENSES, evaluateLens } from '../lib/governance/unified-readiness-lenses.ts'
import { proposeReadinessActions } from '../lib/governance/unified-readiness-actions.ts'
import { createReadinessSnapshot } from '../lib/governance/unified-readiness-snapshot.ts'

const current=(capabilityId,sourceType,maturity)=>({capabilityId,sourceType,source:sourceType.toLowerCase(),maturity,observedAt:'2026-09-30T00:00:00Z',freshness:'CURRENT',reliability:1})

test('planner skips factual observable question when system evidence exists',()=>{
 const plan=planMinimumQuestions({usesAi:false},[current('URA-DISC-CATALOG-001','SYSTEM',4)])
 assert.equal(plan.some(x=>x.capabilityId==='URA-DISC-CATALOG-001'),false)
})

test('planner surfaces human/system contradiction first',()=>{
 const plan=planMinimumQuestions({usesAi:true},[current('URA-SEM-GROUNDING-001','SYSTEM',1),current('URA-SEM-GROUNDING-001','HUMAN',5)])
 assert.equal(plan[0].capabilityId,'URA-SEM-GROUNDING-001')
 assert.equal(plan[0].reason,'CONTRADICTION_REVIEW')
})

test('autonomous agent lens fails closed on critical policy weakness',()=>{
 const ids=['URA-GOV-POLICY-001','URA-TRUST-LINEAGE-001','URA-AIGOV-RISK-001','URA-OBS-DRIFT-001']
 const caps=READINESS_CAPABILITIES.filter(x=>ids.includes(x.id))
 const evidence=ids.map(id=>current(id,'SYSTEM',id==='URA-GOV-POLICY-001'?1:5))
 const result=evaluateReadiness(caps,evidence)
 const lens=READINESS_LENSES.find(x=>x.id==='AUTONOMOUS_AGENT')
 assert.equal(evaluateLens(lens,result.capabilities).gate,'NOT_CLEARED')
})

test('failed gates create proposals but never authorize auto execution',()=>{
 const cap=READINESS_CAPABILITIES.find(x=>x.id==='URA-GOV-POLICY-001')
 const result=evaluateReadiness([cap],[current(cap.id,'SYSTEM',1)])
 const proposals=proposeReadinessActions([cap],result.capabilities)
 assert.equal(proposals.length,1)
 assert.equal(proposals[0].requiresAuthorization,true)
 assert.equal(proposals[0].autoExecute,false)
})

test('snapshot is versioned and immutable by contract',()=>{
 const snapshot=createReadinessSnapshot({id:'s1',organizationId:'o1',context:{usesAi:false},evidence:[],createdAt:'2026-09-30T00:00:00Z',supersedesSnapshotId:null})
 assert.equal(snapshot.frameworkVersion,'DN-URA-1.0')
 assert.equal(snapshot.immutable,true)
 assert.equal(Object.isFrozen(snapshot),true)
})
