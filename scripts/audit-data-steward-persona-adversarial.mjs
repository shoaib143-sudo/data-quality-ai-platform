import fs from 'node:fs'

const failures = []
const workspace = fs.readFileSync('lib/governance/workspace-policy.ts', 'utf8')
const tasks = fs.readFileSync('lib/governance/persona-acceptance-tasks.ts', 'utf8')
const foundation = fs.readFileSync('supabase/migrations/20260904041500_expand_enterprise_capability_catalog.sql', 'utf8')
const agentExecution = fs.readFileSync('supabase/migrations/20260904190310_add_governed_agent_execution_capability.sql', 'utf8')
const readExpansion = fs.readFileSync('supabase/migrations/20260913154500_agent_policy_v2_read_capabilities.sql', 'utf8')
const orchestratorPage = fs.readFileSync('app/agents/autonomous-governance/page.tsx', 'utf8')
const orchestratorUi = fs.readFileSync('app/agents/autonomous-governance/autonomy-console.tsx', 'utf8')
const scheduleRoute = fs.readFileSync('app/api/schedules/route.ts', 'utf8')
const approvalRoute = fs.readFileSync('app/api/agents/governance-orchestrator/approvals/route.ts', 'utf8')

const stewardCreate = fs.readFileSync('app/api/stewardship/assignments/route.ts', 'utf8')
const stewardUpdate = fs.readFileSync('app/api/stewardship/assignments/[assignmentId]/route.ts', 'utf8')
const qualityRun = fs.readFileSync('app/api/data-quality/run/route.ts', 'utf8')
const glossaryCreate = fs.readFileSync('app/api/glossary/route.ts', 'utf8')
const glossaryUpdate = fs.readFileSync('app/api/glossary/[termId]/route.ts', 'utf8')
const classificationCreate = fs.readFileSync('app/api/classifications/route.ts', 'utf8')
const classificationUpdate = fs.readFileSync('app/api/classifications/[classificationId]/route.ts', 'utf8')
const issueCreate = fs.readFileSync('app/api/issues/route.ts', 'utf8')
const issueUpdate = fs.readFileSync('app/api/issues/[issueId]/route.ts', 'utf8')
const issueComment = fs.readFileSync('app/api/issues/[issueId]/comments/route.ts', 'utf8')

function requireText(source, needle, label) {
  if (!source.includes(needle)) failures.push(`${label}: missing ${needle}`)
}

const marker = "where role_key='DATA_STEWARD';"
const end = foundation.indexOf(marker)
const start = foundation.lastIndexOf('update governance.access_roles', end)
const stewardBlock = start >= 0 && end >= 0 ? foundation.slice(start, end + marker.length) : ''

if (!stewardBlock) failures.push('Data Steward capability block could not be isolated.')

for (const forbidden of [
  "'source.manage'",
  "'schedule.manage'",
  "'policy.approve'",
  "'quality.exception.approve'",
  "'contract.approve'",
  "'capacity.manage'",
  "'retention.manage'",
]) {
  if (stewardBlock.includes(forbidden)) failures.push(`Data Steward privilege expansion detected: ${forbidden}`)
}

requireText(agentExecution, "'DATA_STEWARD'", 'governed agent execution grant')
requireText(readExpansion, "'agent.view'", 'read-side agent visibility')
if (readExpansion.includes("'execution.approve'")) failures.push('Agent Policy v2 read expansion must not grant Data Steward approval authority.')

requireText(workspace, "'data-steward':", 'Data Steward workspace policy')
const stewardWorkspaceStart = workspace.indexOf("'data-steward':")
const stewardWorkspaceEnd = workspace.indexOf("],", stewardWorkspaceStart)
const stewardWorkspaceBlock = workspace.slice(stewardWorkspaceStart, stewardWorkspaceEnd + 2)
for (const forbiddenWorkspace of ["'admin'","'platform'","'schedules'","'datasets'"]) {
  if (stewardWorkspaceBlock.includes(forbiddenWorkspace)) failures.push(`Data Steward workspace escalation detected: ${forbiddenWorkspace}`)
}

for (const capability of ['stewardship.manage','quality.execute','glossary.manage','classification.review','issues.manage']) {
  requireText(tasks, `requiredCapability: '${capability}'`, 'real-life task authority')
}

requireText(orchestratorPage, "hasProjectCapability(user.id, project.id, 'agent.execute')", 'autonomous execution capability gate')
requireText(orchestratorPage, "hasProjectCapability(user.id, project.id, 'admin.manage')", 'autonomy administration capability gate')
requireText(orchestratorUi, 'disabled={!canManage || busy}', 'policy controls must remain admin gated')
requireText(orchestratorUi, 'disabled={!canExecute || busy || policy.mode === \'OFF\'}', 'run action must remain execute gated')

requireText(scheduleRoute, "authorizeProject(user.id,projectId,'schedule.manage')", 'schedule creation authorization')
if (/DATA_STEWARD/.test(scheduleRoute)) failures.push('Schedule route must not special-case Data Steward around schedule.manage.')


for (const [label, source, capability] of [
  ['stewardship create', stewardCreate, 'stewardship.manage'],
  ['stewardship update', stewardUpdate, 'stewardship.manage'],
  ['data quality execution', qualityRun, 'quality.execute'],
  ['glossary create', glossaryCreate, 'glossary.manage'],
  ['glossary update', glossaryUpdate, 'glossary.manage'],
  ['classification create', classificationCreate, 'classification.review'],
  ['classification update', classificationUpdate, 'classification.review'],
  ['issue create', issueCreate, 'issues.manage'],
  ['issue update', issueUpdate, 'issues.manage'],
  ['issue comment', issueComment, 'issues.manage'],
]) {
  requireText(source, capability, `${label} capability gate`)
  requireText(source, 'createAdminClient', `${label} trusted persistence path`)
}

requireText(approvalRoute, 'authorityMatches', 'approval authority evaluation')
requireText(approvalRoute, 'You do not hold current', 'approval denial path')
if (/DATA_STEWARD/.test(approvalRoute)) failures.push('Approval route must not special-case Data Steward into approval authority.')

if (failures.length) {
  console.error('Data Steward independent adversarial audit failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('Data Steward independent adversarial audit passed: operational execution is enabled without schedule, admin, policy-approval, source-management, or approval-authority escalation.')
