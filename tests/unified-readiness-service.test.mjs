import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUnifiedReadinessProjection } from '../lib/governance/unified-readiness-service.ts'

test('projection excludes AI capability when AI is not applicable',()=>{
 const result=buildUnifiedReadinessProjection({usesAi:false},[])
 assert.equal(result.capabilities.some(x=>x.dimensionId==='ai-governance'),false)
 assert.equal(result.frameworkVersion,'DN-URA-1.0')
})

test('projection returns use-case lens without granting execution',()=>{
 const result=buildUnifiedReadinessProjection({usesAi:true,useCases:['AUTONOMOUS_AGENT']},[])
 assert.equal(result.lenses.some(x=>x.lensId==='AUTONOMOUS_AGENT'),true)
 assert.equal(result.actions.every(x=>x.autoExecute===false),true)
})
