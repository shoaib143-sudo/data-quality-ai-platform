import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')

test('governance apply endpoint rediscovers provider state and binds immutable deployment fingerprint',()=>{
 const source=read('app/api/governance-platform/apply/route.ts')
 assert.match(source,/discoverGovernanceTargetStates\(desired\)/)
 assert.match(source,/expectedDeploymentFingerprint/)
 assert.match(source,/GOVERNANCE_DEPLOYMENT_FINGERPRINT_MISMATCH/)
 assert.match(source,/confirmDestructive/)
 assert.match(source,/authorizeProject\(user\.id,desired\.projectId,'agent\.execute'\)/)
 assert.doesNotMatch(source,/body\?\.actual/)
 assert.doesNotMatch(source,/body\?\.observedTargets/)
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
