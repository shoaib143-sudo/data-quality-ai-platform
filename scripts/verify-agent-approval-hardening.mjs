import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync('lib/governance/agent-approval-service.ts', 'utf8')
const inbox = fs.readFileSync('lib/governance/approval-inbox.ts', 'utf8')
const requestRoute = fs.readFileSync('app/api/agent-approvals/requests/route.ts', 'utf8')
const detailRoute = fs.readFileSync('app/api/agent-approvals/[requestId]/route.ts', 'utf8')
const decisionRoute = fs.readFileSync('app/api/agent-approvals/[requestId]/decision/route.ts', 'utf8')
const executeRoute = fs.readFileSync('app/api/agent-approvals/[requestId]/execute/route.ts', 'utf8')
const externalRoute = fs.readFileSync('app/api/agent-approvals/external/[token]/decision/route.ts', 'utf8')
const notifications = fs.readFileSync('lib/governance/approval-notifications.ts', 'utf8')
const notificationWorker = fs.readFileSync('lib/governance/approval-notification-worker.ts', 'utf8')

assert.match(service, /resolveProjectRiskContext\(String\(request\.project_id\)\)/, 'project approval fingerprint must recompute current governed risk context')
assert.match(service, /resourceIds: riskContext\.resourceIds/, 'project approval fingerprint must bind current resource set')
assert.match(service, /businessCriticality: riskContext\.businessCriticality/, 'project approval fingerprint must bind current CDE/KDE context')
assert.match(service, /dataSensitivity: riskContext\.dataSensitivity/, 'project approval fingerprint must bind current sensitivity')

assert.match(inbox, /canViewDatasetResource\(userId, datasetId\)/, 'dataset approval inbox must obey resource visibility')
assert.match(inbox, /authorizeDataset\(userId, datasetId, 'agent\.view'\)/, 'dataset approval inbox must require current dataset view capability')
assert.match(inbox, /approvalRequestClientView/, 'approval inbox must use an explicit client projection')
assert.doesNotMatch(inbox.slice(inbox.indexOf('clientRequestFields'), inbox.indexOf('] as const') + 10), /fingerprint_payload|execution_fingerprint|requested_by/, 'client approval projection must not expose internal fingerprint/requester fields')

assert.match(requestRoute, /export async function GET\(/, 'approval request list API must exist')
assert.match(requestRoute, /loadApprovalInbox\(user\.id\)/, 'approval request list API must reuse scoped inbox authorization')
assert.match(requestRoute, /approvalRequestClientView\(approval/, 'approval request create response must use the safe projection')
assert.match(detailRoute, /loadApprovalInbox\(user\.id\)/, 'approval request detail API must reuse scoped inbox authorization')
assert.match(detailRoute, /status: 404/, 'unauthorized or missing approval detail must fail closed')

assert.match(decisionRoute, /channel:\s*'DATANEXUS'/, 'DataNexus decision channel must be server-derived')
assert.doesNotMatch(decisionRoute, /body\?\.channel/, 'browser must not declare decision channel provenance')
assert.match(externalRoute, /payload\.recipientUserId !== user\.id/, 'external approval must bind the signed recipient to the authenticated user')
assert.match(externalRoute, /channel: payload\.channel/, 'external approval channel must come from the signed token')

const validationAt = executeRoute.indexOf('validateApprovalForExecution')
const dispatchAt = executeRoute.indexOf("approval.action_key === 'RUN_PROFILING'")
assert.ok(validationAt >= 0 && dispatchAt > validationAt, 'approval execution facade must reauthorize before choosing a downstream action')
assert.match(executeRoute, /currentExecutionFingerprint/, 'approval execution facade must validate the current execution fingerprint')

assert.match(notifications, /slaDueAt: request\.sla_due_at/, 'approval notification payload must carry canonical SLA due time')
assert.match(notificationWorker, /externalApprovalTokenExpiry\(payload\)/, 'external approval token expiry must derive from the notification SLA context')
assert.match(notificationWorker, /Math\.max\(now \+ DAY_MS, dueAt \+ DAY_MS\)/, 'overdue approvals must receive a fresh bounded link while pre-SLA links remain valid through the due date')
assert.doesNotMatch(notificationWorker, /expiresAt:\s*Date\.now\(\) \+ 8 \* 24 \* 60 \* 60 \* 1000/, 'external approval link lifetime must not be a fixed eight-day window')

console.log('Agent Policy v2 approval hardening contract: PASS')
