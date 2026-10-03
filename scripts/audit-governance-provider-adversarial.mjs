import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')
const runtime=read('lib/governance-platform/runtime/service.ts')
const runner=read('lib/governance-platform/execution/runner.ts')
const checkpoint=read('lib/governance-platform/execution/checkpoint.ts')
const planRoute=read('app/api/governance-platform/plan/route.ts')
const applyRoute=read('app/api/governance-platform/apply/route.ts')
const mcp=read('lib/governance-platform/mcp/handler.ts')
const mcpTools=read('lib/governance-platform/mcp/tools.ts')
const informaticaProvider=read('lib/governance-platform/providers/informatica/provider.ts')
const informaticaManifest=read('lib/governance-platform/providers/informatica/manifest.ts')
const durability=read('supabase/migrations/20261002111500_governance_platform_deployment_evidence_contract.sql')
const resumeHardening=read('supabase/migrations/20261003013000_governance_platform_checkpoint_resume_hardening.sql')
const staleRecovery=read('supabase/migrations/20261003020000_governance_platform_stale_claim_recovery.sql')

const preflightIndex=runtime.indexOf('preflightGovernedProviderOperation(operation,dependencies)')
const executeIndex=runtime.indexOf('executeGovernedProviderOperation(operation,dependencies,preparedByOperation.get(operation.operationId))')
assert.ok(preflightIndex>=0&&executeIndex>preflightIndex,'provider mutation must follow deployment-wide preflight')
assert.match(runtime,/validateGovernanceDesiredState/)
assert.ok(runtime.indexOf('const desired=requireGovernanceDesiredState(input.desired)')<runtime.indexOf("authorizeProject(input.principalId,desired.projectId,'agent.execute')"),'desired-state validation must precede apply authorization and discovery')

assert.doesNotMatch(planRoute,/observedTargets|observedStateSource:supplied/,'public planner must not accept forged actual state')
assert.match(planRoute,/planGovernanceDeploymentForPrincipal/)

for(const source of [applyRoute,mcp])assert.doesNotMatch(source,/getGovernanceProvider|\.execute\(/,'API and MCP facades must not call providers directly')
assert.match(mcp,/authorizeGovernanceMcpTool/)
assert.match(mcp,/applyGovernanceDeploymentForPrincipal/)
assert.doesNotMatch(mcp+ mcpTools,/INFORMATICA_ACCESS_TOKEN|clientSecret|password/i,'MCP surface must not accept provider credentials')

assert.match(informaticaProvider,/UNSUPPORTED_CAPABILITY/)
assert.doesNotMatch(informaticaManifest,/modes:\s*\[[^\]]*'(CREATE|UPDATE|DELETE)'/,'uncertified Informatica mutation modes must not be advertised')

assert.match(checkpoint,/status==='FAILED'\)return'FAILED'/)
assert.match(checkpoint,/status==='PENDING'\|\|checkpoint\.status==='RUNNING'[\s\S]*\?'POLL':'WAIT'/)
assert.match(resumeHardening,/status = 'FAILED'[\s\S]*resume_action', 'FAILED'/)
assert.match(resumeHardening,/status = 'PENDING'[\s\S]*resume_action', 'WAIT'/)
assert.match(staleRecovery,/resume_action', 'RECOVER'/)
assert.match(runner,/resumeAction==='RECOVER'/)
assert.match(runner,/phase:'RECOVERY_READBACK'/)
assert.match(durability,/GOVERNANCE_CHECKPOINT_FENCED/)
assert.match(durability,/claim_generation = claim_generation \+ 1/)
assert.match(durability,/platform_execution_evidence_immutable/)
assert.match(durability,/before update or delete/)

assert.match(runner,/executeWithGovernanceRetry\(\(\)=>provider\.execute\(operation\)/)
assert.doesNotMatch(mcp,/executeWithGovernanceRetry/)
assert.doesNotMatch(applyRoute,/executeWithGovernanceRetry/)

console.log('Governance provider independent adversarial audit passed')
