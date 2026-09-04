import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { evaluateLineageChangeGate } from '@/lib/governance/lineage-change-gate'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import { createAdminClient } from '@/lib/supabase/admin'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

type ExecutionRequest = {
  id: string
  authorization_id: string
  status: string
  workflow_instance_id: string | null
  authorized_at: string
}

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

    const admin = createAdminClient()
    const idempotencyKey = JSON.stringify([gate.analysisId, executionTarget, executionReference])
    const selectRequest = 'id,authorization_id,status,workflow_instance_id,authorized_at'

    const { data: existing, error: existingError } = await admin
      .schema('governance')
      .from('lineage_change_execution_requests')
      .select(selectRequest)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existingError) throw new Error(`Unable to resolve existing lineage execution request: ${existingError.message}`)

    let executionRequest = existing as ExecutionRequest | null
    let reused = Boolean(executionRequest)

    if (!executionRequest) {
      const authorizationId = crypto.randomUUID()
      const { data: created, error: createError } = await admin
        .schema('governance')
        .from('lineage_change_execution_requests')
        .insert({
          project_id: gate.projectId,
          analysis_id: gate.analysisId,
          workflow_instance_id: gate.workflowInstanceId,
          authorization_id: authorizationId,
          requested_by: user.id,
          execution_target: executionTarget,
          execution_reference: executionReference,
          idempotency_key: idempotencyKey,
          status: 'AUTHORIZED',
          authorization_context: {
            decision: gate.decision,
            gate_status: gate.gateStatus,
            approval_required: gate.approvalRequired,
            approval_status: gate.approvalStatus,
            workflow_instance_id: gate.workflowInstanceId,
            production_mutation_performed: false,
          },
        })
        .select(selectRequest)
        .single()

      if (createError?.code === '23505') {
        const { data: concurrent, error: concurrentError } = await admin
          .schema('governance')
          .from('lineage_change_execution_requests')
          .select(selectRequest)
          .eq('idempotency_key', idempotencyKey)
          .single()
        if (concurrentError || !concurrent) throw new Error(`Unable to recover idempotent lineage execution request: ${concurrentError?.message ?? 'not found'}`)
        executionRequest = concurrent as ExecutionRequest
        reused = true
      } else if (createError || !created) {
        throw new Error(`Unable to persist lineage execution request: ${createError?.message ?? 'unknown error'}`)
      } else {
        executionRequest = created as ExecutionRequest
      }
    }

    await writeGovernanceAudit({
      projectId: gate.projectId,
      actorUserId: user.id,
      eventType: reused ? 'LINEAGE_CHANGE_EXECUTION_REQUEST_REUSED' : 'LINEAGE_CHANGE_EXECUTION_AUTHORIZED',
      entityType: 'LINEAGE_CHANGE_EXECUTION_REQUEST',
      entityId: executionRequest.id,
      correlationId: gate.workflowInstanceId ?? executionRequest.authorization_id,
      metadata: {
        execution_request_id: executionRequest.id,
        authorization_id: executionRequest.authorization_id,
        analysis_id: gate.analysisId,
        decision: gate.decision,
        gate_status: gate.gateStatus,
        approval_required: gate.approvalRequired,
        approval_status: gate.approvalStatus,
        workflow_instance_id: gate.workflowInstanceId,
        execution_target: executionTarget,
        execution_reference: executionReference,
        request_status: executionRequest.status,
        reused,
        production_mutation_performed: false,
      },
    })

    return NextResponse.json({
      authorized: true,
      authorizationId: executionRequest.authorization_id,
      executionRequestId: executionRequest.id,
      executionRequestStatus: executionRequest.status,
      reused,
      analysisId: gate.analysisId,
      projectId: gate.projectId,
      workflowInstanceId: executionRequest.workflow_instance_id,
      executionTarget,
      executionReference,
      authorizedAt: executionRequest.authorized_at,
      gate,
      productionMutationPerformed: false,
    }, { status: reused ? 200 : 201 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const message = error instanceof Error ? error.message : 'Unable to authorize lineage change execution.'
    const status = message === 'Lineage impact analysis not found.' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
