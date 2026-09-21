import assert from 'node:assert/strict'
import fs from 'node:fs'

const run = fs.readFileSync('app/journeys/[projectId]/page.tsx', 'utf8')
const incident = fs.readFileSync('app/issues/[issueId]/page.tsx', 'utf8')
const reader = fs.readFileSync('lib/governance/governed-incident-reader.ts', 'utf8')
const truth = fs.readFileSync('lib/governance/governed-incident.ts', 'utf8')

assert.ok(run.includes("canMonitoring\n      ? supabase.schema('agent').from('agent_runs').select('id,status,dataset_id,dataset_version_id"), 'Governance Run must load execution evidence only for personas with monitoring access')
assert.ok(run.includes(".eq('project_id', projectId).order('created_at'"), 'execution evidence must remain project scoped')
assert.ok(run.includes("agentRuns.find(run => String(run.dataset_version_id ?? '') === String(latestVersion.id)) ?? null"), 'latest execution must bind to the current dataset version without cross-dataset fallback')
assert.ok(run.includes("const executionHref = canMonitoring && latestExecution"), 'Job Monitor deep-link must remain persona gated')
assert.ok(run.includes('Latest execution'), 'Governance Run must expose live execution context')
assert.ok(run.includes('Blocker: {latestExecution.error_code}'), 'failed execution must expose the persisted blocker code')
assert.ok(run.includes('Unassigned remediation'), 'Governance Run must expose missing ownership')
assert.ok(run.includes('SLA attention'), 'Governance Run must expose overdue or malformed SLA state')
assert.ok(run.includes("const invalidSlaIssues = openIssues.filter(issue => classifyRemediationSla({ status: issue.status, dueAt: issue.due_at }) === 'INVALID')"), 'malformed due dates must be visible as SLA attention')
assert.ok(run.includes("classifyRemediationSla({ status: issue.status, dueAt: issue.due_at }) === 'OVERDUE'"), 'overdue count must use the shared deterministic SLA rule')
assert.ok(run.includes("const unassignedIssues = openIssues.filter(issue => !issue.owner_user_id)"), 'ownership gap must use persisted issue ownership')
assert.ok(reader.includes('owner_user_id,due_at,resolution_summary'), 'governed incident reader must load due-date truth')
assert.ok(truth.includes('dueAt?: string | null'), 'governed incident truth contract must carry due date')
assert.ok(incident.includes('Remediation SLA'), 'governed incident detail must expose SLA')
assert.ok(incident.includes("incident.truth.ownerUserId?'Assigned':'Unassigned'"), 'governed incident detail must expose ownership state')
assert.ok(incident.includes('classifyRemediationSla({status:incident.truth.issueStatus,dueAt:incident.truth.dueAt})'), 'incident SLA state must use the shared classifier')
assert.ok(incident.includes("slaState==='INVALID'?'Invalid due date'"), 'incident detail must not render malformed dates as a valid schedule')

console.log('Governance Run observability, ownership, and SLA contract passed.')