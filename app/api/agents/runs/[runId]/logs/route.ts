import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const user = await requireUser()
    const { runId } = await context.params
    if (!runId) return NextResponse.json({ error: 'runId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: run, error: runError } = await admin
      .schema('agent')
      .from('agent_runs')
      .select('id, project_id, status, created_at, started_at, completed_at, error_code, error_message')
      .eq('id', runId)
      .single()
    if (runError || !run) return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })

    const { data: project, error: projectError } = await admin
      .schema('app')
      .from('projects')
      .select('id, organization_id')
      .eq('id', run.project_id)
      .single()
    if (projectError || !project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })

    const { data: membership, error: membershipError } = await admin
      .schema('app')
      .from('organization_members')
      .select('organization_id')
      .eq('organization_id', project.organization_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (membershipError) throw new Error(`Unable to verify project access: ${membershipError.message}`)
    if (!membership) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

    const [{ data: steps, error: stepsError }, { data: messages, error: messagesError }, { data: artifacts, error: artifactsError }] = await Promise.all([
      admin.schema('agent').from('agent_run_steps').select('id, agent_run_id, step_name, step_order, status, attempt, input, output, started_at, completed_at, error_code, error_message, created_at').eq('agent_run_id', runId).order('step_order', { ascending: true }),
      admin.schema('agent').from('agent_messages').select('id, source_agent_run_id, target_agent_run_id, message_type, correlation_id, payload, status, created_at, delivered_at, processed_at').or(`source_agent_run_id.eq.${runId},target_agent_run_id.eq.${runId}`).order('created_at', { ascending: true }),
      admin.schema('agent').from('agent_artifacts').select('id, agent_run_id, artifact_type, artifact_version, name, payload, storage_uri, content_hash, created_at').eq('agent_run_id', runId).order('created_at', { ascending: true }),
    ])
    if (stepsError) throw new Error(`Unable to load execution steps: ${stepsError.message}`)
    if (messagesError) throw new Error(`Unable to load execution messages: ${messagesError.message}`)
    if (artifactsError) throw new Error(`Unable to load execution artifacts: ${artifactsError.message}`)

    const timeline = [
      { id: `run-created-${run.id}`, timestamp: run.created_at, level: 'INFO', event_type: 'RUN_CREATED', message: 'Agent run created.', details: null, source: 'agent_runs' },
      ...(run.started_at ? [{ id: `run-started-${run.id}`, timestamp: run.started_at, level: 'INFO', event_type: 'RUN_STARTED', message: 'Agent run started.', details: null, source: 'agent_runs' }] : []),
      ...(steps ?? []).flatMap((step) => [
        ...(step.started_at ? [{ id: `step-start-${step.id}`, timestamp: step.started_at, level: 'INFO', event_type: 'STEP_STARTED', message: `Step started: ${step.step_name}`, details: { stepId: step.id, stepOrder: step.step_order, attempt: step.attempt }, source: 'agent_run_steps' }] : []),
        ...(step.error_message ? [{ id: `step-error-${step.id}`, timestamp: step.completed_at ?? step.started_at ?? step.created_at, level: 'ERROR', event_type: 'STEP_ERROR', message: step.error_message, details: { stepId: step.id, errorCode: step.error_code }, source: 'agent_run_steps' }] : []),
        ...(step.completed_at ? [{ id: `step-complete-${step.id}`, timestamp: step.completed_at, level: step.status === 'FAILED' ? 'ERROR' : 'INFO', event_type: 'STEP_COMPLETED', message: `Step ${step.status.toLowerCase()}: ${step.step_name}`, details: { stepId: step.id, status: step.status, attempt: step.attempt }, source: 'agent_run_steps' }] : []),
      ]),
      ...(messages ?? []).map((message) => ({ id: `message-${message.id}`, timestamp: message.created_at, level: 'INFO', event_type: message.message_type, message: `Agent message: ${message.message_type}`, details: message.payload, source: 'agent_messages' })),
      ...(artifacts ?? []).map((artifact) => ({ id: `artifact-${artifact.id}`, timestamp: artifact.created_at, level: 'INFO', event_type: 'ARTIFACT_CREATED', message: `Artifact created: ${artifact.name}`, details: { artifactId: artifact.id, artifactType: artifact.artifact_type, storageUri: artifact.storage_uri, contentHash: artifact.content_hash }, source: 'agent_artifacts' })),
      ...(run.completed_at ? [{ id: `run-complete-${run.id}`, timestamp: run.completed_at, level: run.error_code ? 'ERROR' : 'INFO', event_type: 'RUN_COMPLETED', message: run.error_message ?? `Run finished with status ${run.status}.`, details: { status: run.status, errorCode: run.error_code }, source: 'agent_runs' }] : []),
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    const level = new URL(request.url).searchParams.get('level')
    return NextResponse.json({ runId, run, steps: steps ?? [], messages: messages ?? [], artifacts: artifacts ?? [], logs: level ? timeline.filter((entry) => entry.level === level) : timeline, source: 'execution_lifecycle' })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load execution diagnostics.' }, { status: 500 })
  }
}
