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

requireText('app/lineage/impact/change-impact-manager.tsx', [
  'Pre-change impact gate',
  'Start governed approval',
  'productionMutationPerformed',
])

console.log('Lineage change governance contracts verified.')
