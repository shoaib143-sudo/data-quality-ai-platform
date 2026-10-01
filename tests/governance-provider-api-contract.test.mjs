import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')

test('governance apply endpoint delegates immutable preflight and durable execution to runtime service',()=>{
 const route=read('app/api/governance-platform/apply/route.ts')
 const service=read('lib/governance-platform/runtime/service.ts')
 assert.match(route,/applyGovernanceDeploymentForPrincipal/)
 assert.match(route,/expectedDeploymentFingerprint/)
 assert.match(route,/confirmDestructive/)
 assert.doesNotMatch(route,/body\?\.actual/)
 assert.doesNotMatch(route,/body\?\.observedTargets/)
 assert.match(service,/discoverGovernanceTargetStates\(input\.desired\)/)
 assert.match(service,/GOVERNANCE_DEPLOYMENT_FINGERPRINT_MISMATCH/)
 assert.match(service,/GOVERNANCE_DESTRUCTIVE_CONFIRMATION_REQUIRED/)
 assert.match(service,/authorizeProject\(input\.principalId,input\.desired\.projectId,'agent\.execute'\)/)
 assert.match(service,/SupabaseGovernanceCheckpointStore/)
 assert.match(service,/SupabaseGovernanceEvidenceStore/)
})

test('governance verification discovers authoritative provider state instead of trusting client actual state',()=>{
 const route=read('app/api/governance-platform/verify/route.ts')
 const service=read('lib/governance-platform/runtime/service.ts')
 assert.match(route,/verifyGovernanceDeploymentForPrincipal/)
 assert.doesNotMatch(route,/body\?\.actual/)
 assert.match(service,/planGovernanceDeploymentForPrincipal/)
 assert.match(service,/discoverGovernanceTargetStates\(desired\)/)
})

test('governance planning can discover authoritative state while retaining explicit offline simulation input',()=>{
 const source=read('app/api/governance-platform/plan/route.ts')
 assert.match(source,/discoverGovernanceTargetStates\(desired\)/)
 assert.match(source,/observedStateSource:supplied\?'SUPPLIED':'DISCOVERED'/)
 assert.match(source,/authorizeProject\(user\.id,desired\.projectId,'catalog\.read'\)/)
})

test('provider capability endpoint is authenticated, project scoped, and exposes conformance',()=>{
 const source=read('app/api/governance-platform/capabilities/route.ts')
 assert.match(source,/requireApiUser\(\)/)
 assert.match(source,/authorizeProject\(user\.id,projectId,'catalog\.read'\)/)
 assert.match(source,/validateProviderManifest/)
 assert.match(source,/private, no-store/)
})
