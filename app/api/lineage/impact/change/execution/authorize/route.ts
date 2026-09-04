import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { evaluateLineageChangeGate } from '@/lib/governance/lineage-change-gate'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const analysisId = text(body.analysisId)
    const executionTarget = text(body.executionTarget) || 'EXTERNAL_CHANGE_EXECUTOR'
    const executionReference = text(body.executionReference) || null
    if (!analysisId) return NextResponse.json({ error: 'analysisId is required.' }, { status: 400 })

    const gate = await evaluateLineageChangeGate(analysisId)
    await authorizeProject(user.id, gate.projectId, 'lineage.manage')

    if (!gate.canProceed || gate.gateStatus !== 'OPEN') {
      await writeGovernanceAudit({
        projectId: gate.projectId,
        actorUserId: user.id,
        eventType: 'LINEAGE_CHANGE_EXECUTION_BLOCKED',
        entityType: 'LINEAGE_IMPACT_ANALYSIS',
        entityId: gate.analysisId,
        correlationId: gate.workflowInstanceId,
        metadata: {
          decision: gate.decision,
          gate_status: gate.gateStatus,
          approval_required: gate.approvalRequired,
          approval_status: gate.approvalStatus,
          execution_target: executionTarget,
          execution_reference: executionReference,
          production_mutation_performed: false,
        },
      })
      return NextResponse.json({
        authorized: false,
        gate,
        executionTarget,
        executionReference,
        productionMutationPerformed: false,
      }, { status: 409 })
    }

    const authorizationId = crypto.randomUUID()
    await writeGovernanceAudit({
      projectId: gate.projectId,
      actorUserId: user.id,
      eventType: 'LINEAGE_CHANGE_EXECUTION_AUTHORIZED',
      entityType: 'LINEAGE_IMPACT_ANALYSIS',
      entityId: gate.analysisId,
      correlationId: gate.workflowInstanceId ?? authorizationId,
      metadata: {
        authorization_id: authorizationId,
        decision: gate.decision,
        gate_status: gate.gateStatus,
        approval_required: gate.approvalRequired,
        approval_status: gate.approvalStatus,
        workflow_instance_id: gate.workflowInstanceId,
        execution_target: executionTarget,
        execution_reference: executionReference,
        production_mutation_performed: false,
      },
    })

    return NextResponse.json({
      authorized: true,
      authorizationId,
      analysisId: gate.analysisId,
      projectId: gate.projectId,
      workflowInstanceId: gate.workflowInstanceId,
      executionTarget,
      executionReference,
      gate,
      productionMutationPerformed: false,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const message = error instanceof Error ? error.message : 'Unable to authorize lineage change execution.'
    const status = message === 'Lineage impact analysis not found.' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
