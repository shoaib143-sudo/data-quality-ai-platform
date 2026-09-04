import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing required lineage governance file: ${path}`)
  return fs.readFileSync(path, 'utf8')
}

function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing required lineage governance contract: ${pattern}`)
  }
  return source
}

function forbidText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (source.includes(pattern)) throw new Error(`${path} contains forbidden lineage governance contract: ${pattern}`)
  }
}

requireText('lib/governance/lineage-change-impact.ts', [
  'assessProposedLineageChange',
  'APPROVAL_REQUIRED',
  'REVIEW_REQUIRED',
  'SAFE_TO_PROCEED',
  'production_mutation_performed: false',
  'LINEAGE_PROPOSED_CHANGE_ASSESSED',
])
forbidText('lib/governance/lineage-change-impact.ts', ['production_mutation_performed: true'])

const approval = requireText('app/api/lineage/impact/change/approval/route.ts', [
  "authorizeProject(user.id, analysis.project_id, 'workflow.manage')",
  'LINEAGE_CHANGE_APPROVAL',
  'LINEAGE_IMPACT_ANALYSIS',
  'approval_required',
  "decision) !== 'APPROVAL_REQUIRED'",
  'start_workflow',
  'LINEAGE_CHANGE_APPROVAL_STARTED',
  'production_mutation_performed: false',
])
if (!approval.includes(".in('status', ['RUNNING', 'APPROVED'])")) {
  throw new Error('Lineage approval must reuse an active or already-approved workflow for the same analysis.')
}
forbidText('app/api/lineage/impact/change/approval/route.ts', ['production_mutation_performed: true'])

requireText('app/api/lineage/impact/change/approval/status/route.ts', [
  "authorizeProject(user.id, analysis.project_id, 'lineage.read')",
  'LINEAGE_CHANGE_APPROVAL',
  'LINEAGE_IMPACT_ANALYSIS',
  'workflow_instances',
  'workflowVersion',
  'productionMutationPerformed: false',
])
forbidText('app/api/lineage/impact/change/approval/status/route.ts', ['productionMutationPerformed: true'])

const gate = requireText('lib/governance/lineage-change-gate.ts', [
  'evaluateLineageChangeGate',
  "decision === 'SAFE_TO_PROCEED'",
  "decision === 'REVIEW_REQUIRED'",
  "approvalStatus === 'APPROVED'",
  "gateStatus: approved ? 'OPEN' : 'BLOCKED'",
  'productionMutationPerformed: false',
])
if (!gate.includes(".eq('entity_id', analysis.id)")) {
  throw new Error('Lineage deployment gate must bind approval to the exact persisted impact analysis.')
}
forbidText('lib/governance/lineage-change-gate.ts', ['productionMutationPerformed: true'])

requireText('app/api/lineage/impact/change/gate/route.ts', [
  'evaluateLineageChangeGate',
  "authorizeProject(user.id, gate.projectId, 'lineage.read')",
  'analysisId is required.',
])

const handoffMigration = requireText('supabase/migrations/20260904179000_lineage_change_execution_handoff.sql', [
  'governance.lineage_change_execution_requests',
  'idempotency_key text not null unique',
  "'AUTHORIZED','CLAIMED','EXECUTING','SUCCEEDED','FAILED','CANCELLED'",
  'alter table governance.lineage_change_execution_requests enable row level security',
  'app_private.is_project_member(project_id)',
  'revoke insert,update,delete on governance.lineage_change_execution_requests from authenticated',
  'grant select on governance.lineage_change_execution_requests to authenticated',
  'grant all on governance.lineage_change_execution_requests to service_role',
  'trg_audit_lineage_change_execution_requests',
])
if (!handoffMigration.includes('authorization_id uuid not null unique')) {
  throw new Error('Lineage execution handoff authorization identifiers must be unique.')
}

const execution = requireText('app/api/lineage/impact/change/execution/authorize/route.ts', [
  'evaluateLineageChangeGate',
  "authorizeProject(user.id, gate.projectId, 'lineage.manage')",
  "gate.gateStatus !== 'OPEN'",
  'LINEAGE_CHANGE_EXECUTION_BLOCKED',
  'LINEAGE_CHANGE_EXECUTION_AUTHORIZED',
  'LINEAGE_CHANGE_EXECUTION_REQUEST_REUSED',
  'lineage_change_execution_requests',
  'idempotencyKey',
  "createError?.code === '23505'",
  'executionRequestId',
  'authorizationId',
  'productionMutationPerformed: false',
  'production_mutation_performed: false',
])
if (!execution.includes('!gate.canProceed')) {
  throw new Error('Lineage execution authorization must fail closed when the deployment gate cannot proceed.')
}
if (!execution.includes('JSON.stringify([gate.analysisId, executionTarget, executionReference])')) {
  throw new Error('Lineage execution handoff must be idempotent for the exact analysis and execution destination.')
}
forbidText('app/api/lineage/impact/change/execution/authorize/route.ts', [
  'productionMutationPerformed: true',
  'production_mutation_performed: true',
])

requireText('app/api/lineage/impact/change/execution/status/route.ts', [
  "authorizeProject(user.id, analysis.project_id, 'lineage.read')",
  'lineage_change_execution_requests',
  ".eq('analysis_id', analysis.id)",
  'authorizationId',
  'executionTarget',
  'productionMutationPerformedByLineage: false',
])
forbidText('app/api/lineage/impact/change/execution/status/route.ts', ['productionMutationPerformedByLineage: true'])

requireText('app/lineage/impact/change-impact-manager.tsx', [
  'Pre-change impact gate',
  'Start governed approval',
  'Deployment gate',
  'Authorize execution handoff',
  'Governed execution handoff',
  '/api/lineage/impact/change/gate?analysisId=',
  '/api/lineage/impact/change/execution/authorize',
  '/api/lineage/impact/change/execution/status?analysisId=',
  'productionMutationPerformed',
])

console.log('Lineage change governance contracts verified.')
