import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeAgentAction } from '@/lib/governance/agent-authorization'
import { getAgentActionProfile } from '@/lib/governance/agent-action-catalog'
import { resolveDatasetRiskContext, resolveProjectRiskContext } from '@/lib/governance/agent-risk-context'
import { createAgentApprovalRequest } from '@/lib/governance/agent-approval-service'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    const actionKey = text(body?.actionKey ?? body?.action_key)
    const datasetId = text(body?.datasetId ?? body?.dataset_id)
    const parameters = body?.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
      ? body.parameters as Record<string, unknown>
      : {}

    const profile = getAgentActionProfile(actionKey)
    const projectId = text(body?.projectId ?? body?.project_id)

    const riskContext = profile.target === 'DATASET'
      ? await (async () => {
          if (!datasetId) throw new Error('datasetId is required for this action.')
          const context = await resolveDatasetRiskContext(datasetId)
          await authorizeAgentAction(user.id, profile.requestCapability, {
            type: 'DATASET',
            projectId: context.projectId,
            datasetId,
          })
          return { ...context, resourceIds: [datasetId], targetType: 'DATASET' as const, targetId: datasetId }
        })()
      : await (async () => {
          if (!projectId) throw new Error('projectId is required for this action.')
          const context = await resolveProjectRiskContext(projectId)
          await authorizeAgentAction(user.id, profile.requestCapability, {
            type: 'PROJECT',
            projectId: context.projectId,
          })
          return { ...context, targetType: 'PROJECT' as const, targetId: projectId }
        })()

    const admin = createAdminClient()
    const { data: projectPolicy, error: policyError } = await admin.schema('governance')
      .from('project_agent_policy_context')
      .select('environment,policy_version')
      .eq('project_id', riskContext.projectId)
      .maybeSingle()
    if (policyError) throw new Error(`Unable to resolve project Agent Policy context: ${policyError.message}`)

    const environment = projectPolicy?.environment === 'NON_PRODUCTION' ? 'NON_PRODUCTION' : 'PRODUCTION'
    const policyVersion = String(projectPolicy?.policy_version ?? 'agent-policy-v2.0')

    const approval = await createAgentApprovalRequest({
      projectId: riskContext.projectId,
      requestedBy: user.id,
      domain: riskContext.domain,
      actionKey: profile.key,
      targetType: riskContext.targetType,
      targetId: riskContext.targetId,
      policyVersion,
      resourceIds: riskContext.resourceIds,
      parameters,
      environment,
      materialProductionMutation: profile.materialProductionMutation,
      businessCriticality: riskContext.businessCriticality,
      dataSensitivity: riskContext.dataSensitivity,
      financialImpact: profile.financialImpact,
      productionScope: profile.productionScope,
      reversibility: profile.reversibility,
      computeCost: profile.computeCost,
    })

    return NextResponse.json({
      approval,
      riskContext: {
        domain: riskContext.domain,
        businessCriticality: riskContext.businessCriticality,
        dataSensitivity: riskContext.dataSensitivity,
      },
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create approval request.' }, { status: 400 })
  }
}
