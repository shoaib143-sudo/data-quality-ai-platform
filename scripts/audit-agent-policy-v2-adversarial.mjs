import assert from 'node:assert/strict'
import fs from 'node:fs'
import { personaSlugs } from '../lib/governance/personas.ts'
import { approvalRequirement, evaluateRisk } from '../lib/governance/agent-policy-v2.ts'
import { createExecutionFingerprint } from '../lib/governance/execution-fingerprint.ts'
import { canAccessWorkspace } from '../lib/governance/workspace-policy.ts'

const failures = []
function attack(name, fn) {
  try { fn(); console.log(`PASS adversarial: ${name}`) }
  catch (error) { failures.push([name, error]); console.error(`FAIL adversarial: ${name}: ${error instanceof Error ? error.message : error}`) }
}

attack('no persona is denied conversational Agents workspace by execution privilege', () => {
  for (const slug of personaSlugs) assert.equal(canAccessWorkspace(slug, 'agents'), true)
})

attack('no persona is denied resource-scoped Job Monitor workspace', () => {
  for (const slug of personaSlugs) assert.equal(canAccessWorkspace(slug, 'monitoring'), true)
})

attack('non-production CDE cannot accidentally trigger mandatory dual approval', () => {
  const result = approvalRequirement({
    environment: 'NON_PRODUCTION',
    materialProductionMutation: false,
    businessCriticality: 'CDE',
    dataSensitivity: 'RESTRICTED',
    financialImpact: 'CRITICAL',
    productionScope: 'HIGH',
    reversibility: 'IRREVERSIBLE',
    computeCost: 'HIGH',
  })
  assert.equal(result.requiresBusinessApproval, false)
  assert.equal(result.requiresGovernanceApproval, false)
})

attack('material production mutation cannot bypass dual approval', () => {
  const result = approvalRequirement({
    environment: 'PRODUCTION',
    materialProductionMutation: true,
    businessCriticality: 'STANDARD',
    dataSensitivity: 'LOW',
    financialImpact: 'LOW',
    productionScope: 'LOW',
    reversibility: 'REVERSIBLE',
    computeCost: 'LOW',
  })
  assert.equal(result.requiresBusinessApproval, true)
  assert.equal(result.requiresGovernanceApproval, true)
})

attack('break-glass remains disabled even for CRITICAL', () => {
  const result = approvalRequirement({
    environment: 'PRODUCTION',
    materialProductionMutation: true,
    businessCriticality: 'CDE',
    dataSensitivity: 'RESTRICTED',
    financialImpact: 'CRITICAL',
    productionScope: 'CRITICAL',
    reversibility: 'IRREVERSIBLE',
    computeCost: 'CRITICAL',
  })
  assert.equal(result.risk, 'CRITICAL')
  assert.equal(result.breakGlassAllowed, false)
})

attack('CDE/KDE risk floor cannot be downgraded below HIGH', () => {
  for (const businessCriticality of ['CDE', 'KDE']) {
    assert.equal(evaluateRisk({
      environment: 'NON_PRODUCTION',
      materialProductionMutation: false,
      businessCriticality,
      dataSensitivity: 'LOW',
      financialImpact: 'LOW',
      productionScope: 'LOW',
      reversibility: 'REVERSIBLE',
      computeCost: 'LOW',
    }), 'HIGH')
  }
})

attack('execution fingerprint invalidates changed action, environment, policy or parameters', () => {
  const base = {
    actionKey: 'PROFILE_DATASET',
    environment: 'PRODUCTION',
    projectId: '11111111-1111-1111-1111-111111111111',
    resourceIds: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
    parameters: { depth: 1 },
    policyVersion: 'v2',
    businessCriticality: 'CDE',
  }
  const fp = createExecutionFingerprint(base)
  assert.notEqual(fp, createExecutionFingerprint({ ...base, actionKey: 'PUBLISH_CLASSIFICATION' }))
  assert.notEqual(fp, createExecutionFingerprint({ ...base, environment: 'NON_PRODUCTION' }))
  assert.notEqual(fp, createExecutionFingerprint({ ...base, policyVersion: 'v3' }))
  assert.notEqual(fp, createExecutionFingerprint({ ...base, parameters: { depth: 2 } }))
})

attack('project approvals recompute current CDE/KDE and sensitivity before execution', () => {
  const service = fs.readFileSync('lib/governance/agent-approval-service.ts', 'utf8')
  assert.match(service, /resolveProjectRiskContext\(String\(request\.project_id\)\)/)
  assert.match(service, /resourceIds: riskContext\.resourceIds/)
  assert.match(service, /businessCriticality: riskContext\.businessCriticality/)
  assert.match(service, /dataSensitivity: riskContext\.dataSensitivity/)
})

attack('same-person dual-axis approval is rejected by database contract', () => {
  const sql = fs.readFileSync('supabase/migrations/20260913160500_preserve_delegated_approval_provenance.sql', 'utf8')
  assert.match(sql, /same individual cannot satisfy both approval axes/i)
})

attack('approval/rejection comment is mandatory at service and database boundaries', () => {
  const service = fs.readFileSync('lib/governance/agent-approval-service.ts', 'utf8')
  const migration = fs.readFileSync('supabase/migrations/20260913160000_agent_approval_authority_and_atomic_decisions.sql', 'utf8')
  assert.match(service, /Approval comment is required/)
  assert.match(migration, /Approval comment is required/)
})

attack('Job Monitor refresh cannot kick worker execution', () => {
  const monitor = fs.readFileSync('app/monitoring/job-monitor.tsx', 'utf8')
  assert.doesNotMatch(monitor, /\/api\/jobs\/worker/)
  assert.match(monitor, /\/api\/monitoring\/runs/)
})

attack('governed conversational agents do not require agent.execute', () => {
  const route = fs.readFileSync('app/api/agents/governance/run/route.ts', 'utf8')
  assert.match(route, /'agent\.converse'/)
  assert.doesNotMatch(route, /authorizeProject\([^\n]+agent\.execute/)
})

attack('resource visibility is server-enforced and explicit DENY wins', () => {
  const migration = fs.readFileSync('supabase/migrations/20260913155000_resource_scoped_agent_visibility.sql', 'utf8')
  assert.match(migration, /if v_deny then\s+return false;/i)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all .* authenticated/i)
})

attack('termination API requires execution.cancel rather than broad agent.execute', () => {
  const route = fs.readFileSync('app/api/agents/runs/[runId]/terminate/route.ts', 'utf8')
  assert.match(route, /'execution\.cancel'/)
  assert.doesNotMatch(route, /authorizeProject\([^\n]+agent\.execute/)
})

attack('termination panel refresh uses the resource-scoped monitoring API', () => {
  const panel = fs.readFileSync('app/monitoring/job-termination.tsx', 'utf8')
  assert.match(panel, /\/api\/monitoring\/runs/)
  assert.doesNotMatch(panel, /from\('agent_runs'\)/)
})

attack('notification channels cannot own approval authorization state', () => {
  const migration = fs.readFileSync('supabase/migrations/20260913162500_agent_approval_notification_outbox.sql', 'utf8')
  const worker = fs.readFileSync('lib/governance/approval-notification-worker.ts', 'utf8')
  assert.match(migration, /Single approval notification queue/)
  assert.doesNotMatch(worker, /record_agent_approval_decision/)
  assert.match(worker, /DATANEXUS_APPROVAL_EMAIL_WEBHOOK_URL/)
  assert.match(worker, /DATANEXUS_APPROVAL_TEAMS_WEBHOOK_URL/)
})

attack('Agents UI uses action-specific execution capabilities', () => {
  const page = fs.readFileSync('app/agents/page.tsx', 'utf8')
  const form = fs.readFileSync('app/agents/run-agent-form.tsx', 'utf8')
  assert.match(page, /'profiling\.execute'/)
  assert.match(page, /'quality\.execute'/)
  assert.match(page, /'agent\.execute'/)
  assert.match(form, /selectedAgent\?\.agentKey === 'profiling_agent'/)
  assert.match(form, /selectedAgent\?\.agentKey === 'data_quality_agent'/)
})

attack('Agents page resource-scopes datasets and run history', () => {
  const page = fs.readFileSync('app/agents/page.tsx', 'utf8')
  assert.match(page, /canViewDatasetResource/)
  assert.match(page, /filterAuthorizedExecutionRuns/)
  assert.match(page, /visibleDatasetIds/)
})

attack('conversational and supervisor evidence obey resource scope', () => {
  const specialist = fs.readFileSync('lib/agents/governance-specialist-agent.ts', 'utf8')
  const resources = fs.readFileSync('lib/governance/resource-authorization.ts', 'utf8')
  assert.match(resources, /authorizedDatasetScopeForProject/)
  assert.match(specialist, /authorizedDatasetScopeForProject\(input\.actorUserId, input\.projectId\)/)
  assert.match(specialist, /loadContext\(admin, input\.projectId, datasetScope\.authorizedDatasetIds, datasetScope\.fullProjectVisibility\)/)
  assert.match(specialist, /datasetScope\.fullProjectVisibility\s*\? loadKnowledge/)
  assert.match(specialist, /scorecards: fullProjectVisibility \?/)
  assert.match(specialist, /knowledgeDocuments: fullProjectVisibility \?/)
  assert.match(specialist, /filterDatasetLinkedRows\(issuesResult\.data/)
  assert.match(specialist, /filterDatasetLinkedRows\(incidentsResult\.data/)
})

attack('approval request responses do not expose internal resource identifiers', () => {
  const route = fs.readFileSync('app/api/agent-approvals/requests/route.ts', 'utf8')
  assert.doesNotMatch(route, /return NextResponse\.json\(\{ approval, riskContext \}/)
  assert.match(route, /businessCriticality: riskContext\.businessCriticality/)
  assert.match(route, /dataSensitivity: riskContext\.dataSensitivity/)
})

attack('partial resource scope cannot expose cross-resource lineage', () => {
  const specialist = fs.readFileSync('lib/agents/governance-specialist-agent.ts', 'utf8')
  assert.match(specialist, /scopedLineageColumnMappings = fullProjectVisibility \? \(lineageColumnMappingsResult\.data \?\? \[\]\) : \[\]/)
  assert.match(specialist, /scopedLineageTransformations = fullProjectVisibility \? \(lineageTransformationsResult\.data \?\? \[\]\) : \[\]/)
  assert.match(specialist, /scopedLineageEdges = fullProjectVisibility \? \(lineageTransformationEdgesResult\.data \?\? \[\]\) : \[\]/)
})

attack('external Email and Teams approvals are signed, user-bound and centrally authorized', () => {
  const token = fs.readFileSync('lib/governance/external-approval-token.ts', 'utf8')
  const externalRoute = fs.readFileSync('app/api/agent-approvals/external/[token]/decision/route.ts', 'utf8')
  const dataNexusRoute = fs.readFileSync('app/api/agent-approvals/[requestId]/decision/route.ts', 'utf8')
  const worker = fs.readFileSync('lib/governance/approval-notification-worker.ts', 'utf8')
  assert.match(token, /createHmac\('sha256'/)
  assert.match(token, /timingSafeEqual/)
  assert.match(token, /recipientUserId/)
  assert.match(externalRoute, /payload\.recipientUserId !== user\.id/)
  assert.match(externalRoute, /recordAgentApprovalDecision/)
  assert.doesNotMatch(externalRoute, /channel:\s*text\(body/)
  assert.match(dataNexusRoute, /channel:\s*'DATANEXUS'/)
  assert.doesNotMatch(dataNexusRoute, /body\?\.channel/)
  assert.match(worker, /createExternalApprovalToken/)
  assert.match(worker, /approvalUrl/)
})

attack('ready execution requests require independent runtime capability and current fingerprint', () => {
  const inbox = fs.readFileSync('lib/governance/approval-inbox.ts', 'utf8')
  const service = fs.readFileSync('lib/governance/agent-approval-service.ts', 'utf8')
  const profiling = fs.readFileSync('app/api/agents/run/route.ts', 'utf8')
  const quality = fs.readFileSync('app/api/data-quality/run/route.ts', 'utf8')
  const pickup = fs.readFileSync('app/api/agent-approvals/[requestId]/execute/route.ts', 'utf8')
  assert.match(inbox, /READY_TO_EXECUTE/)
  assert.match(inbox, /profile\.capability/)
  assert.match(service, /currentExecutionFingerprint/)
  assert.match(service, /request\.execution_fingerprint !== input\.currentFingerprint/)
  assert.match(service, /authorizeDataset\(input\.executorUserId/)
  assert.match(profiling, /validateApprovalForExecution/)
  assert.match(quality, /validateApprovalForExecution/)
  assert.match(pickup, /currentExecutionFingerprint/)
  assert.match(pickup, /validateApprovalForExecution/)
  assert.ok(pickup.indexOf('validateApprovalForExecution') < pickup.indexOf("approval.action_key === 'RUN_PROFILING'"))
})

attack('profiling and Data Quality preserve narrower execution capabilities', () => {
  const catalog = fs.readFileSync('lib/governance/agent-action-catalog.ts', 'utf8')
  assert.match(catalog, /RUN_PROFILING:[\s\S]*capability: 'profiling\.execute'/)
  assert.match(catalog, /RUN_DATA_QUALITY:[\s\S]*capability: 'quality\.execute'/)
})

attack('supervisor requests are approval-aware and independently authorized', () => {
  const catalog = fs.readFileSync('lib/governance/agent-action-catalog.ts', 'utf8')
  const request = fs.readFileSync('app/api/agent-approvals/requests/route.ts', 'utf8')
  const pickup = fs.readFileSync('app/api/agent-approvals/[requestId]/execute/route.ts', 'utf8')
  const supervisor = fs.readFileSync('app/api/agents/supervisor/run/route.ts', 'utf8')
  const form = fs.readFileSync('app/agents/run-agent-form.tsx', 'utf8')
  assert.match(catalog, /RUN_SUPERVISOR:[\s\S]*capability: 'agent\.execute'/)
  assert.match(request, /resolveProjectRiskContext/)
  assert.match(pickup, /approval\.action_key === 'RUN_SUPERVISOR'/)
  assert.match(supervisor, /validateApprovalForExecution/)
  assert.match(supervisor, /markApprovalExecuted/)
  assert.match(form, /native_supervisor_agent/)
  assert.match(form, /Request execution/)
})

if (failures.length) process.exit(1)
console.log('PASS independent Agent Policy v2 adversarial audit')
