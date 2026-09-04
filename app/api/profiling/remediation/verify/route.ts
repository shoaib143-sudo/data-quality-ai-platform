import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyRemediationOutcome } from '@/lib/profiling/remediation-verification'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const workflowInstanceId = text(body.workflowInstanceId)
    let verificationProfileRunId = text(body.verificationProfileRunId)

    if (!workflowInstanceId) {
      return NextResponse.json({ error: 'workflowInstanceId is required.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: instance, error: instanceError } = await admin
      .schema('governance')
      .from('workflow_instances')
      .select('id,project_id,entity_type,entity_id,status,context')
      .eq('id', workflowInstanceId)
      .maybeSingle()

    if (instanceError) throw new Error(`Unable to load workflow instance: ${instanceError.message}`)
    if (!instance) return NextResponse.json({ error: 'Workflow instance not found.' }, { status: 404 })
    if (instance.entity_type !== 'PROFILE_RUN' || instance.status !== 'APPROVED') {
      return NextResponse.json({ error: 'An approved profiling remediation workflow is required.' }, { status: 409 })
    }

    await authorizeProject(user.id, instance.project_id, 'quality.read')

    const context = object(instance.context)
    if (context.source !== 'PROFILING_INVESTIGATION') {
      return NextResponse.json({ error: 'Workflow does not contain profiling investigation evidence.' }, { status: 409 })
    }

    const sourceProfileRunId = text(context.profile_run_id) || instance.entity_id
    const sourceDatasetId = text(context.dataset_id)
    if (!sourceDatasetId) {
      return NextResponse.json({ error: 'Workflow is missing the source dataset identifier.' }, { status: 409 })
    }

    const [{ data: sourceRun, error: sourceRunError }, { data: linkedOutcome, error: linkedOutcomeError }] = await Promise.all([
      admin.schema('profiling').from('profile_runs').select('id,completed_at').eq('id', sourceProfileRunId).maybeSingle(),
      admin.schema('governance').from('profiling_remediation_outcomes').select('status,verification_profile_run_id,verification_agent_run_id,verification_job_id,verification_requested_at').eq('workflow_instance_id', workflowInstanceId).maybeSingle(),
    ])

    if (sourceRunError) throw new Error(`Unable to load source profiling run: ${sourceRunError.message}`)
    if (!sourceRun?.completed_at) return NextResponse.json({ error: 'Source profiling run is not complete.' }, { status: 409 })
    if (linkedOutcomeError) throw new Error(`Unable to resolve linked remediation outcome: ${linkedOutcomeError.message}`)

    const explicitVerificationRunId = Boolean(verificationProfileRunId)
    if (!explicitVerificationRunId && linkedOutcome?.status === 'ACTION_TRACKED') {
      return NextResponse.json({
        error: 'Tracked remediation must be resolved before verification is evaluated.',
        code: 'REMEDIATION_IN_PROGRESS',
        remediationStatus: linkedOutcome.status,
      }, { status: 409 })
    }

    if (!explicitVerificationRunId && linkedOutcome?.status === 'VERIFICATION_CANCELLED') {
      return NextResponse.json({
        error: 'Automatic verification was cancelled. Restart verification before evaluating remediation.',
        code: 'VERIFICATION_CANCELLED_RESTART_REQUIRED',
        remediationStatus: linkedOutcome.status,
        verificationProfileRunId: linkedOutcome.verification_profile_run_id,
        verificationAgentRunId: linkedOutcome.verification_agent_run_id,
        verificationJobId: linkedOutcome.verification_job_id,
      }, { status: 409 })
    }

    if (!explicitVerificationRunId && linkedOutcome?.status === 'VERIFICATION_QUEUED' && !linkedOutcome.verification_profile_run_id) {
      return NextResponse.json({
        error: 'Automatic verification has been claimed and is being prepared.',
        code: 'VERIFICATION_QUEUE_PENDING',
        remediationStatus: linkedOutcome.status,
        verificationRequestedAt: linkedOutcome.verification_requested_at,
      }, { status: 409 })
    }

    let verificationSource: 'API_LINKED' | 'API_EXPLICIT' | 'API_FALLBACK' = explicitVerificationRunId
      ? 'API_EXPLICIT'
      : 'API_LINKED'

    if (!verificationProfileRunId && linkedOutcome?.verification_profile_run_id) {
      verificationProfileRunId = linkedOutcome.verification_profile_run_id
    }

    if (!verificationProfileRunId) {
      verificationSource = 'API_FALLBACK'
      const { data: versions, error: versionsError } = await admin
        .schema('catalog')
        .from('dataset_versions')
        .select('id')
        .eq('dataset_id', sourceDatasetId)
      if (versionsError) throw new Error(`Unable to resolve dataset versions: ${versionsError.message}`)

      const versionIds = (versions ?? []).map((version) => version.id)
      if (!versionIds.length) return NextResponse.json({ error: 'No dataset versions are available for verification.' }, { status: 409 })

      const { data: latestRun, error: latestRunError } = await admin
        .schema('profiling')
        .from('profile_runs')
        .select('id')
        .in('dataset_version_id', versionIds)
        .eq('status', 'COMPLETED')
        .neq('id', sourceProfileRunId)
        .gt('completed_at', sourceRun.completed_at)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (latestRunError) throw new Error(`Unable to locate verification profiling run: ${latestRunError.message}`)
      if (!latestRun) {
        return NextResponse.json({
          error: 'No completed post-remediation profiling run is available yet.',
          code: 'VERIFICATION_PROFILE_PENDING',
          sourceProfileRunId,
          automaticVerificationStatus: linkedOutcome?.status ?? null,
        }, { status: 409 })
      }
      verificationProfileRunId = latestRun.id
    }

    const { data: verificationRun, error: verificationRunError } = await admin
      .schema('profiling')
      .from('profile_runs')
      .select('id,status,agent_run_id')
      .eq('id', verificationProfileRunId)
      .maybeSingle()
    if (verificationRunError) throw new Error(`Unable to load verification profiling run: ${verificationRunError.message}`)
    if (!verificationRun) return NextResponse.json({ error: 'Verification profiling run not found.' }, { status: 404 })
    if (verificationRun.status !== 'COMPLETED') {
      return NextResponse.json({
        error: verificationRun.status === 'RUNNING' ? 'Automatic verification profiling is still running.' : `Verification profiling run is ${verificationRun.status}.`,
        code: verificationRun.status === 'RUNNING' ? 'VERIFICATION_PROFILE_RUNNING' : 'VERIFICATION_PROFILE_NOT_COMPLETE',
        verificationProfileRunId,
        verificationAgentRunId: verificationRun.agent_run_id ?? linkedOutcome?.verification_agent_run_id ?? null,
        verificationJobId: linkedOutcome?.verification_job_id ?? null,
      }, { status: 409 })
    }

    const result = await verifyRemediationOutcome({
      workflowInstanceId,
      verificationProfileRunId,
      actorUserId: user.id,
      verificationSource,
    })

    return NextResponse.json(result, { status: result.verificationPassed ? 200 : 409 })
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to verify profiling remediation.',
    }, { status: 500 })
  }
}
