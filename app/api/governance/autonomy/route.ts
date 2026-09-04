import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  applyPredictiveRiskGovernedActions,
  executeApprovedGovernedAction,
  listGovernedAutonomy,
  proposeGovernedAction,
  rollbackGovernedAction,
} from '@/lib/governance/governed-autonomy'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function requireActionInProject(actionId: string, projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('autonomy_actions')
    .select('id,project_id,status')
    .eq('id', actionId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw new Error(`Unable to validate autonomy action project: ${error.message}`)
  if (!data) return null
  return data
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const projectId = new URL(request.url).searchParams.get('projectId')?.trim() ?? ''
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })
    await authorizeProject(user.id, projectId, 'agent.execute')
    return NextResponse.json({ projectId, ...(await listGovernedAutonomy(projectId)) })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load governed autonomy.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const projectId = text(body?.projectId ?? body?.project_id)
    const operation = text(body?.operation).toUpperCase()
    if (!projectId || !operation) return NextResponse.json({ error: 'projectId and operation are required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'issues.manage')

    if (operation === 'APPLY_PREDICTIVE_RISK') {
      return NextResponse.json({ accepted: true, result: await applyPredictiveRiskGovernedActions(projectId) })
    }

    if (operation === 'EXECUTE_APPROVED') {
      const actionId = text(body?.actionId ?? body?.action_id)
      if (!actionId) return NextResponse.json({ error: 'actionId is required.' }, { status: 400 })
      if (!(await requireActionInProject(actionId, projectId))) return NextResponse.json({ error: 'Autonomy action was not found in this project.' }, { status: 404 })
      const action = await executeApprovedGovernedAction(actionId, user.id)
      return NextResponse.json({ accepted: true, action })
    }

    if (operation === 'ROLLBACK') {
      const actionId = text(body?.actionId ?? body?.action_id)
      if (!actionId) return NextResponse.json({ error: 'actionId is required.' }, { status: 400 })
      if (!(await requireActionInProject(actionId, projectId))) return NextResponse.json({ error: 'Autonomy action was not found in this project.' }, { status: 404 })
      const action = await rollbackGovernedAction(actionId, user.id)
      return NextResponse.json({ accepted: true, action })
    }

    if (operation === 'PROPOSE') {
      const actionKey = text(body?.actionKey ?? body?.action_key).toUpperCase()
      const targetType = text(body?.targetType ?? body?.target_type).toUpperCase()
      const targetId = text(body?.targetId ?? body?.target_id) || null
      const riskLevel = text(body?.riskLevel ?? body?.risk_level).toUpperCase()
      const confidence = number(body?.confidence)
      const idempotencyKey = text(body?.idempotencyKey ?? body?.idempotency_key)
      if (!actionKey || !targetType || !riskLevel || confidence === null || !idempotencyKey) {
        return NextResponse.json({ error: 'actionKey, targetType, riskLevel, confidence and idempotencyKey are required.' }, { status: 400 })
      }
      if (!['INFO','LOW','MEDIUM','HIGH','CRITICAL'].includes(riskLevel)) {
        return NextResponse.json({ error: 'riskLevel is invalid.' }, { status: 400 })
      }
      const proposed = await proposeGovernedAction({
        projectId,
        actionKey,
        targetType,
        targetId,
        riskLevel: riskLevel as 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        confidence,
        idempotencyKey,
        requestedBy: user.id,
        sourceAgentRunId: text(body?.sourceAgentRunId ?? body?.source_agent_run_id) || null,
        input: body?.input && typeof body.input === 'object' && !Array.isArray(body.input) ? body.input as Record<string, unknown> : {},
      })
      return NextResponse.json({ accepted: true, ...proposed })
    }

    return NextResponse.json({ error: 'Unsupported operation.' }, { status: 400 })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Governed autonomy operation failed.' }, { status: 500 })
  }
}
