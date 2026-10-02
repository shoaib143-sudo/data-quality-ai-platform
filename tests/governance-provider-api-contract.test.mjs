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


test('execution status uses the aggregate deployment id returned by apply',()=>{
 const route=read('app/api/governance-platform/status/route.ts')
 const service=read('lib/governance-platform/runtime/service.ts')
 assert.match(route,/deploymentId/)
 assert.doesNotMatch(route,/searchParams\.get\('planId'\)/)
 assert.match(service,/listByDeployment\(projectId,deploymentId\)/)
})


test('apply preflights every operation before entering the execution loop',()=>{
 const service=read('lib/governance-platform/runtime/service.ts')
 const preflightIndex=service.indexOf('preflightGovernedProviderOperation(operation,dependencies)')
 const blockedIndex=service.indexOf("GOVERNANCE_APPROVAL_REQUIRED")
 const executeIndex=service.indexOf('executeGovernedProviderOperation(operation,dependencies,preparedByOperation.get(operation.operationId))')
 assert.ok(preflightIndex>=0&&blockedIndex>preflightIndex&&executeIndex>blockedIndex)
})


test('governance deployment approval is fingerprint bound and resumable from the existing approval inbox',()=>{
 const service=read('lib/governance-platform/runtime/service.ts')
 const apply=read('app/api/governance-platform/apply/route.ts')
 const approvalRoute=read('app/api/agent-approvals/[requestId]/execute/route.ts')
 const catalog=read('lib/governance/agent-action-catalog.ts')
 assert.match(catalog,/APPLY_GOVERNANCE_DEPLOYMENT/)
 assert.match(apply,/approvalRequestId/)
 assert.match(service,/currentExecutionFingerprint/)
 assert.match(service,/validateApprovalForExecution/)
 assert.match(service,/expectedActionKey:'APPLY_GOVERNANCE_DEPLOYMENT'/)
 assert.match(service,/createAgentApprovalRequest/)
 assert.match(service,/markApprovalExecuted/)
 assert.match(approvalRoute,/APPLY_GOVERNANCE_DEPLOYMENT/)
 assert.match(approvalRoute,/applyGovernanceDeploymentForPrincipal/)
})
