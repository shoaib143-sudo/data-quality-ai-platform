import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyDataQualityRemediation } from '@/lib/data-quality/remediation-verification'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const workflowInstanceId = text(body.workflowInstanceId)
    const verificationAgentRunId = text(body.verificationAgentRunId)
    if (!workflowInstanceId || !verificationAgentRunId) {
      return NextResponse.json({ error: 'workflowInstanceId and verificationAgentRunId are required.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: outcome, error: outcomeError } = await admin
      .schema('governance')
      .from('data_quality_remediation_outcomes')
      .select('project_id')
      .eq('workflow_instance_id', workflowInstanceId)
      .maybeSingle()
    if (outcomeError) throw new Error(`Unable to load data quality remediation outcome: ${outcomeError.message}`)
    if (!outcome) return NextResponse.json({ error: 'Data quality remediation outcome not found.' }, { status: 404 })

    await authorizeProject(user.id, outcome.project_id, 'quality.read')

    const result = await verifyDataQualityRemediation({
      workflowInstanceId,
      verificationAgentRunId,
      actorUserId: user.id,
      verificationSource: 'MANUAL_API',
    })

    return NextResponse.json(result, { status: result.verificationPassed ? 200 : 409 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify data quality remediation.' }, { status: 500 })
  }
}
