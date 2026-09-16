import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import {
  getLatestCoverageRun,
  getProjectAutonomyPolicy,
  runGovernanceOrchestrator,
  upsertProjectAutonomyPolicy,
} from '@/lib/orchestration/governance-orchestrator-service-v2'
import {
  getLatestGovernanceOutcomeReport,
  normalizeReportingPreference,
  persistRunReportingPreference,
} from '@/lib/orchestration/governance-outcome-report-service'
import type { AutonomyMode, AutonomyPolicy, RiskTier } from '@/lib/orchestration/governance-orchestrator'

export const maxDuration = 300

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function arrayOfText(value: unknown) { return Array.isArray(value) ? value.map(text).filter(Boolean) : [] }
function finiteNonNegative(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}
function positiveInteger(value: unknown, fallback: number, max: number) {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 && number <= max ? number : fallback
}

function policyFromBody(body: Record<string, unknown>): AutonomyPolicy {
  const mode = text(body.mode) as AutonomyMode
  const risk = text(body.maximumRiskTier ?? body.maximum_risk_tier) as RiskTier
  if (!['OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS'].includes(mode)) throw new Error('Invalid autonomy mode.')
  if (!['NONE','LOW','MEDIUM','HIGH','CRITICAL'].includes(risk)) throw new Error('Invalid maximum risk tier.')
  const enabled = body.enabled === true
  if (mode === 'OFF' && enabled) throw new Error('OFF mode cannot be enabled.')
  if (mode !== 'OFF' && !enabled) throw new Error('Non-OFF modes must be explicitly enabled.')
  return {
    mode, enabled,
    policyVersion: text(body.policyVersion ?? body.policy_version) || `policy-${Date.now()}`,
    maximumRiskTier: risk,
    allowedAgentKeys: arrayOfText(body.allowedAgentKeys ?? body.allowed_agent_keys),
    allowedToolKeys: arrayOfText(body.allowedToolKeys ?? body.allowed_tool_keys),
    allowedModelClasses: arrayOfText(body.allowedModelClasses ?? body.allowed_model_classes),
    allowedMutationClasses: arrayOfText(body.allowedMutationClasses ?? body.allowed_mutation_classes),
    approvalRequiredActions: arrayOfText(body.approvalRequiredActions ?? body.approval_required_actions),
    autoRemediationEnabled: body.autoRemediationEnabled === true || body.auto_remediation_enabled === true,
    autoRollbackEnabled: body.autoRollbackEnabled === true || body.auto_rollback_enabled === true,
    maxExecutionBudget: finiteNonNegative(body.maxExecutionBudget ?? body.max_execution_budget, 0),
    maxModelBudget: finiteNonNegative(body.maxModelBudget ?? body.max_model_budget, 0),
    maxRuntimeMs: positiveInteger(body.maxRuntimeMs ?? body.max_runtime_ms, 300000, 3600000),
    maxDatasetsChangedPerRun: Math.floor(finiteNonNegative(body.maxDatasetsChangedPerRun ?? body.max_datasets_changed_per_run, 0)),
    maxProjectsAffectedPerRun: positiveInteger(body.maxProjectsAffectedPerRun ?? body.max_projects_affected_per_run, 1, 100),
    maxRemediationActionsPerHour: Math.floor(finiteNonNegative(body.maxRemediationActionsPerHour ?? body.max_remediation_actions_per_hour, 0)),
    maxConcurrentModelCalls: Math.floor(finiteNonNegative(body.maxConcurrentModelCalls ?? body.max_concurrent_model_calls, 0)),
    emergencyStop: body.emergencyStop === true || body.emergency_stop === true,
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const projectId = text(new URL(request.url).searchParams.get('projectId'))
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.view')
    const [policy, latestCoverageRun, latestReport] = await Promise.all([
      getProjectAutonomyPolicy(projectId),
      getLatestCoverageRun(projectId),
      getLatestGovernanceOutcomeReport({ projectId }),
    ])
    return NextResponse.json({ policy, latestCoverageRun, latestReport })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load orchestrator state.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    if (!projectId || !body) return NextResponse.json({ error: 'projectId and policy body are required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'admin.manage')
    const policy = policyFromBody(body)
    await upsertProjectAutonomyPolicy(projectId, user.id, policy)
    return NextResponse.json({ updated: true, policy })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    const message = error instanceof Error ? error.message : 'Unable to update autonomy policy.'
    return NextResponse.json({ error: message }, { status: message.startsWith('Invalid ') || message.includes('mode') ? 400 : 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const goal = text(body?.goal)
    if (!projectId || !goal) return NextResponse.json({ error: 'projectId and goal are required.' }, { status: 400 })
    if (goal.length > 2000) return NextResponse.json({ error: 'goal must be 2000 characters or fewer.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.execute')

    const reportingInput = body?.reporting && typeof body.reporting === 'object' && !Array.isArray(body.reporting)
      ? body.reporting as Record<string, unknown>
      : null
    const reporting = normalizeReportingPreference(reportingInput ? {
      enabled: reportingInput.enabled === true,
      persona: text(reportingInput.persona) as never,
      depth: text(reportingInput.depth) as never,
    } : null)

    const result = await runGovernanceOrchestrator({ projectId, actorUserId: user.id, goal })
    await persistRunReportingPreference({ projectId, orchestratorRunId: result.orchestratorRunId, preference: reporting })

    const status = result.status === 'WAITING_APPROVAL' ? 202 : result.status === 'SUCCEEDED' ? 200 : 409
    return NextResponse.json({ accepted: result.status === 'SUCCEEDED', reporting, ...result }, { status })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governance orchestrator execution failed.' }, { status: 500 })
  }
}
