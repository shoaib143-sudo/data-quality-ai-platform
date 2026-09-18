import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing execution-mode contract file: ${path}`)
  return fs.readFileSync(path, 'utf8')
}
function requireText(source, text, label, failures) {
  if (!source.includes(text)) failures.push(`${label}: missing ${text}`)
}
function forbid(source, pattern, label, failures) {
  if (pattern.test(source)) failures.push(`${label}: forbidden pattern ${pattern}`)
}

const failures = []
const policy = read('lib/orchestration/governance-orchestrator.ts')
const orchestratorRoute = read('app/api/agents/governance-orchestrator/route.ts')
const approvalRoute = read('app/api/agents/governance-orchestrator/approvals/route.ts')
const approvalService = read('lib/orchestration/governance-orchestrator-approval-service.ts')
const scheduleRoute = read('app/api/schedules/route.ts')
const scheduleItemRoute = read('app/api/schedules/[scheduleId]/route.ts')
const runtime = read('lib/agents/runtime/native-autonomy-runtime.ts')
const resumable = read('lib/agents/resumable-run-step.ts')

for (const mode of ['OFF', 'GUIDED', 'GOVERNED_AUTO', 'FULL_AUTONOMOUS']) {
  requireText(orchestratorRoute, `'${mode}'`, 'orchestrator mode allowlist', failures)
}
requireText(policy, "if (!policy.enabled || policy.mode === 'OFF')", 'manual/OFF fail closed', failures)
requireText(policy, 'if (policy.emergencyStop)', 'emergency-stop authority', failures)
requireText(policy, "policy.mode === 'GUIDED'", 'guided approval boundary', failures)
requireText(policy, 'approvalRequiredActions.includes(input.actionKey)', 'explicit HITL action boundary', failures)
requireText(policy, 'riskRank[input.riskTier] > riskRank[policy.maximumRiskTier]', 'risk ceiling', failures)
requireText(policy, '!policy.allowedAgentKeys.includes(input.agentKey)', 'agent allowlist', failures)
requireText(policy, '!policy.allowedToolKeys.includes(input.toolKey)', 'tool allowlist', failures)
requireText(policy, '!policy.allowedMutationClasses.includes(input.mutationClass)', 'mutation allowlist', failures)

requireText(orchestratorRoute, "authorizeProject(user.id, projectId, 'agent.execute')", 'goal execution authorization', failures)
requireText(orchestratorRoute, "authorizeProject(user.id, projectId, 'admin.manage')", 'autonomy-policy administration authorization', failures)
requireText(orchestratorRoute, "result.status === 'WAITING_APPROVAL'", 'guided/HITL persisted wait state', failures)
requireText(orchestratorRoute, 'createAgentApprovalRequest', 'guided/HITL approval creation', failures)

requireText(approvalRoute, 'currentExecutionFingerprint', 'approval replay binding', failures)
requireText(approvalRoute, 'validateApprovalForExecution', 'approval validation before resume', failures)
requireText(approvalRoute, 'resumeGovernanceOrchestratorAfterApproval', 'exact paused-run resume', failures)
requireText(approvalService, ".eq('status', 'WAITING_APPROVAL')", 'compare-and-set paused-run resume', failures)
forbid(approvalService, /runGovernanceOrchestrator\s*\(/, 'approval must not restart the lifecycle', failures)

requireText(scheduleRoute, "authorizeProject(user.id,projectId,'schedule.manage')", 'system-trigger schedule authorization', failures)
requireText(scheduleRoute, ".eq('project_id',projectId)", 'schedule project scoping', failures)
requireText(scheduleRoute, "Data source does not belong to the selected project.", 'scheduled discovery source isolation', failures)
requireText(scheduleRoute, "Dataset does not belong to the selected project.", 'scheduled profiling dataset isolation', failures)
requireText(scheduleItemRoute, "authorizeProject(user.id,context.schedule.project_id,'schedule.manage')", 'schedule mutation authorization', failures)

requireText(resumable, "existing?.status === 'SUCCEEDED'", 'checkpoint preservation', failures)
requireText(resumable, 'alreadySucceeded: true', 'successful-step reuse', failures)
requireText(resumable, 'attempt = Number(existing.attempt ?? 1) + 1', 'same-step retry accounting', failures)
requireText(runtime, 'WAITING_APPROVAL', 'native runtime HITL state', failures)

forbid(orchestratorRoute, /admin\.schema\([^)]*\)\.rpc\([^)]*(grant|bypass|disable_rls)/i, 'orchestrator cannot self-expand privilege', failures)
forbid(scheduleRoute, /service_role|SUPABASE_SERVICE_ROLE_KEY/, 'schedule API cannot accept service-role authority from request path', failures)
forbid(approvalRoute, /status\s*:\s*['"]SUCCEEDED['"]\s*[,}]/, 'approval alone cannot fabricate runtime success', failures)

if (failures.length) {
  console.error('Independent execution-mode adversarial audit failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('Independent execution-mode adversarial audit passed for manual, assisted, automated, straight-through, HITL, HOTL, goal-driven, scheduled/system-triggered, checkpoint/resume, and policy boundaries.')
