import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueDurableJob } from '@/lib/orchestration/queue'
import { writeGovernanceAudit } from '@/lib/governance/audit'

const PROFILING_AGENT_KEY = 'profiling_agent'
const PROFILING_AGENT_VERSION = '2.0'
const PROFILING_ENGINE_NAME = 'profiling-engine'
const PROFILING_ENGINE_VERSION = '1.1'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function positiveInteger(value: unknown, fallback = 1) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export type RemediationVerificationScheduleResult = {
  status: 'NOT_REMEDIATION' | 'WAITING_FOR_REMEDIATION' | 'ALREADY_QUEUED' | 'QUEUED'
  workflowInstanceId?: string
  profilingRunId?: string | null
  agentRunId?: string | null
  durableJobId?: string | null
  unresolvedIssueIds?: string[]
}

export async function scheduleRemediationVerificationFromIssue(input: {
  issueId: string
  projectId: string
  sourceProfileRunId: string
  userId: string
}): Promise<RemediationVerificationScheduleResult> {
  const admin = createAdminClient()

  const { data: outcome, error: outcomeError } = await admin
    .schema('governance')
    .from('profiling_remediation_outcomes')
    .select('id,project_id,workflow_instance_id,source_profile_run_id,verification_profile_run_id,verification_agent_run_id,verification_job_id,verification_requested_at,status,remediation_issue_ids,outcome')
    .eq('project_id', input.projectId)
    .eq('source_profile_run_id', input.sourceProfileRunId)
    .contains('remediation_issue_ids', [input.issueId])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (outcomeError) throw new Error(`Unable to resolve remediation verification outcome: ${outcomeError.message}`)
  if (!outcome) return { status: 'NOT_REMEDIATION' }

  if (outcome.verification_job_id || ['VERIFIED', 'VERIFICATION_FAILED'].includes(outcome.status)) {
    return {
      status: 'ALREADY_QUEUED',
      workflowInstanceId: outcome.workflow_instance_id,
      profilingRunId: outcome.verification_profile_run_id,
      agentRunId: outcome.verification_agent_run_id,
      durableJobId: outcome.verification_job_id,
    }
  }

  const issueIds = Array.isArray(outcome.remediation_issue_ids)
    ? outcome.remediation_issue_ids.map((value) => text(value)).filter(Boolean)
    : []
  if (!issueIds.length) return { status: 'NOT_REMEDIATION' }

  const { data: trackedIssues, error: trackedIssuesError } = await admin
    .schema('governance')
    .from('issues')
    .select('id,status')
    .in('id', issueIds)
  if (trackedIssuesError) throw new Error(`Unable to resolve tracked remediation issues: ${trackedIssuesError.message}`)

  const unresolvedIssueIds = (trackedIssues ?? [])
    .filter((issue) => !['RESOLVED', 'CLOSED'].includes(text(issue.status).toUpperCase()))
    .map((issue) => issue.id)
  const missingIssueIds = issueIds.filter((issueId) => !(trackedIssues ?? []).some((issue) => issue.id === issueId))

  if (missingIssueIds.length || unresolvedIssueIds.length) {
    return {
      status: 'WAITING_FOR_REMEDIATION',
      workflowInstanceId: outcome.workflow_instance_id,
      unresolvedIssueIds: [...unresolvedIssueIds, ...missingIssueIds],
    }
  }

  const { data: claimed, error: claimError } = await admin
    .schema('governance')
    .rpc('claim_profiling_remediation_verification', {
      p_workflow_instance_id: outcome.workflow_instance_id,
      p_user_id: input.userId,
    })

  if (claimError) throw new Error(`Unable to claim remediation verification: ${claimError.message}`)
  if (claimed !== true) {
    const { data: current } = await admin
      .schema('governance')
      .from('profiling_remediation_outcomes')
      .select('verification_profile_run_id,verification_agent_run_id,verification_job_id')
      .eq('workflow_instance_id', outcome.workflow_instance_id)
      .maybeSingle()
    return {
      status: 'ALREADY_QUEUED',
      workflowInstanceId: outcome.workflow_instance_id,
      profilingRunId: current?.verification_profile_run_id ?? null,
      agentRunId: current?.verification_agent_run_id ?? null,
      durableJobId: current?.verification_job_id ?? null,
    }
  }

  const initialOutcome = object(outcome.outcome)
  const verificationGeneration = positiveInteger(initialOutcome.verification_generation)
  let agentRunId: string | null = outcome.verification_agent_run_id ?? null
  let profilingRunId: string | null = outcome.verification_profile_run_id ?? null
  let jobEnqueued = false

  try {
    const { data: sourceRun, error: sourceRunError } = await admin
      .schema('profiling')
      .from('profile_runs')
      .select('id,dataset_version_id')
      .eq('id', outcome.source_profile_run_id)
      .maybeSingle()
    if (sourceRunError || !sourceRun) throw new Error(`Unable to resolve source profiling run: ${sourceRunError?.message ?? 'not found'}`)

    const { data: sourceVersion, error: sourceVersionError } = await admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id,dataset_id')
      .eq('id', sourceRun.dataset_version_id)
      .maybeSingle()
    if (sourceVersionError || !sourceVersion) throw new Error(`Unable to resolve source dataset version: ${sourceVersionError?.message ?? 'not found'}`)

    const { data: candidateVersions, error: candidateError } = await admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id,dataset_id,version_number,status')
      .eq('dataset_id', sourceVersion.dataset_id)
      .eq('status', 'AVAILABLE')
      .order('version_number', { ascending: false })
      .limit(20)
    if (candidateError) throw new Error(`Unable to resolve verification dataset versions: ${candidateError.message}`)

    const candidateIds = (candidateVersions ?? []).map((version) => version.id)
    if (!candidateIds.length) throw new Error('No AVAILABLE dataset version exists for remediation verification.')

    const { data: executionSources, error: executionSourceError } = await admin
      .schema('profiling')
      .from('dataset_execution_sources')
      .select('dataset_version_id,active')
      .in('dataset_version_id', candidateIds)
      .eq('active', true)
    if (executionSourceError) throw new Error(`Unable to resolve verification execution source: ${executionSourceError.message}`)

    const executableIds = new Set((executionSources ?? []).map((source) => source.dataset_version_id))
    let verificationVersion = (candidateVersions ?? []).find((version) => executableIds.has(version.id))
    if (!verificationVersion) throw new Error('No AVAILABLE dataset version has an active profiling execution source for remediation verification.')

    const { data: agentDefinition, error: agentDefinitionError } = await admin
      .schema('agent')
      .from('agent_definitions')
      .select('id,agent_key,version,enabled')
      .eq('agent_key', PROFILING_AGENT_KEY)
      .eq('version', PROFILING_AGENT_VERSION)
      .eq('enabled', true)
      .maybeSingle()
    if (agentDefinitionError || !agentDefinition) throw new Error(`Unable to resolve profiling agent definition: ${agentDefinitionError?.message ?? 'not found'}`)

    if (profilingRunId || agentRunId) {
      if (!profilingRunId || !agentRunId) throw new Error('Automatic verification linkage is incomplete and cannot be resumed safely.')
      const [{ data: linkedProfile, error: linkedProfileError }, { data: linkedAgent, error: linkedAgentError }] = await Promise.all([
        admin.schema('profiling').from('profile_runs').select('id,dataset_version_id,agent_run_id,status').eq('id', profilingRunId).maybeSingle(),
        admin.schema('agent').from('agent_runs').select('id,agent_definition_id,status').eq('id', agentRunId).maybeSingle(),
      ])
      if (linkedProfileError || !linkedProfile) throw new Error(`Unable to resume linked verification profile: ${linkedProfileError?.message ?? 'not found'}`)
      if (linkedAgentError || !linkedAgent) throw new Error(`Unable to resume linked verification agent run: ${linkedAgentError?.message ?? 'not found'}`)
      if (linkedProfile.agent_run_id !== agentRunId || linkedAgent.agent_definition_id !== agentDefinition.id) {
        throw new Error('Automatic verification linkage does not match the active profiling agent contract.')
      }
      verificationVersion = (candidateVersions ?? []).find((version) => version.id === linkedProfile.dataset_version_id && executableIds.has(version.id))
      if (!verificationVersion) throw new Error('Linked verification dataset version is no longer AVAILABLE with an active execution source.')
      if (!['RUNNING', 'FAILED'].includes(linkedProfile.status)) throw new Error(`Linked verification profile is ${linkedProfile.status} and cannot be re-queued.`)
      if (!['CREATED', 'QUEUED', 'FAILED'].includes(linkedAgent.status)) throw new Error(`Linked verification agent run is ${linkedAgent.status} and cannot be re-queued.`)
      if (linkedProfile.status === 'FAILED') {
        await admin.schema('profiling').from('profile_runs').update({ status: 'RUNNING', error_code: null, error_message: null, completed_at: null, started_at: new Date().toISOString() }).eq('id', profilingRunId)
      }
      if (linkedAgent.status === 'FAILED') {
        await admin.schema('agent').from('agent_runs').update({ status: 'QUEUED', error_code: null, error_message: null, completed_at: null }).eq('id', agentRunId)
      }
    }

    const requestInput = {
      trigger: 'PROFILING_REMEDIATION_VERIFICATION',
      automaticVerification: true,
      workflowInstanceId: outcome.workflow_instance_id,
      sourceProfileRunId: outcome.source_profile_run_id,
      datasetVersionId: verificationVersion.id,
      verificationGeneration,
    }

    if (!agentRunId || !profilingRunId) {
      const { data: agentRun, error: agentRunError } = await admin
        .schema('agent')
        .from('agent_runs')
        .insert({
          agent_definition_id: agentDefinition.id,
          project_id: input.projectId,
          dataset_id: sourceVersion.dataset_id,
          dataset_version_id: verificationVersion.id,
          status: 'QUEUED',
          input: requestInput,
        })
        .select('id')
        .single()
      if (agentRunError || !agentRun) throw new Error(`Unable to create verification agent run: ${agentRunError?.message ?? 'unknown error'}`)
      agentRunId = agentRun.id

      const { data: profileRun, error: profileRunError } = await admin
        .schema('profiling')
        .from('profile_runs')
        .insert({
          dataset_version_id: verificationVersion.id,
          status: 'RUNNING',
          agent_run_id: agentRun.id,
          engine_name: PROFILING_ENGINE_NAME,
          engine_version: PROFILING_ENGINE_VERSION,
          configuration: {
            agent_definition_id: agentDefinition.id,
            agent_key: agentDefinition.agent_key,
            agent_version: agentDefinition.version,
            execution_mode: 'durable_queue_outbox',
            trigger: 'PROFILING_REMEDIATION_VERIFICATION',
            workflow_instance_id: outcome.workflow_instance_id,
            source_profile_run_id: outcome.source_profile_run_id,
            verification_generation: verificationGeneration,
          },
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (profileRunError || !profileRun) throw new Error(`Unable to create verification profiling run: ${profileRunError?.message ?? 'unknown error'}`)
      profilingRunId = profileRun.id

      const { error: preQueuePersistError } = await admin
        .schema('governance')
        .from('profiling_remediation_outcomes')
        .update({
          verification_profile_run_id: profilingRunId,
          verification_agent_run_id: agentRunId,
          status: 'VERIFICATION_QUEUED',
          updated_at: new Date().toISOString(),
          outcome: {
            ...initialOutcome,
            verification_generation: verificationGeneration,
            verification_trigger: 'AUTOMATIC_ON_REMEDIATION_RESOLUTION',
            verification_dataset_version_id: verificationVersion.id,
            verification_queue_phase: 'PROFILE_PREPARED',
          },
        })
        .eq('workflow_instance_id', outcome.workflow_instance_id)
      if (preQueuePersistError) throw new Error(`Unable to persist prepared verification run linkage: ${preQueuePersistError.message}`)
    }

    const idempotencyKey = `profiling:remediation-verification:${outcome.workflow_instance_id}:${verificationGeneration}`
    const durableJob = await enqueueDurableJob({
      projectId: input.projectId,
      jobType: 'PROFILING',
      entityId: verificationVersion.id,
      agentRunId,
      idempotencyKey,
      payload: {
        userId: input.userId,
        projectId: input.projectId,
        datasetVersionId: verificationVersion.id,
        agentDefinitionId: agentDefinition.id,
        agentVersion: agentDefinition.version,
        agentRunId,
        profilingRunId,
        requestInput,
      },
      priority: 90,
      maxAttempts: 3,
    })
    jobEnqueued = true

    const currentOutcome = await admin
      .schema('governance')
      .from('profiling_remediation_outcomes')
      .select('outcome')
      .eq('workflow_instance_id', outcome.workflow_instance_id)
      .maybeSingle()
    if (currentOutcome.error) throw new Error(`Unable to reload automatic verification outcome: ${currentOutcome.error.message}`)

    const { error: persistError } = await admin
      .schema('governance')
      .from('profiling_remediation_outcomes')
      .update({
        verification_profile_run_id: profilingRunId,
        verification_agent_run_id: agentRunId,
        verification_job_id: durableJob.id,
        status: 'VERIFICATION_QUEUED',
        updated_at: new Date().toISOString(),
        outcome: {
          ...object(currentOutcome.data?.outcome),
          verification_generation: verificationGeneration,
          verification_trigger: 'AUTOMATIC_ON_REMEDIATION_RESOLUTION',
          verification_dataset_version_id: verificationVersion.id,
          verification_job_id: durableJob.id,
          verification_queue_phase: 'JOB_ENQUEUED',
        },
      })
      .eq('workflow_instance_id', outcome.workflow_instance_id)
    if (persistError) throw new Error(`Unable to persist automatic verification job linkage: ${persistError.message}`)

    await writeGovernanceAudit({
      projectId: input.projectId,
      actorUserId: input.userId,
      eventType: 'PROFILING_REMEDIATION_REPROFILE_QUEUED',
      entityType: 'PROFILE_RUN',
      entityId: profilingRunId,
      correlationId: outcome.workflow_instance_id,
      metadata: {
        workflow_instance_id: outcome.workflow_instance_id,
        source_profile_run_id: outcome.source_profile_run_id,
        verification_profile_run_id: profilingRunId,
        verification_agent_run_id: agentRunId,
        verification_job_id: durableJob.id,
        verification_dataset_version_id: verificationVersion.id,
        verification_generation: verificationGeneration,
      },
    })

    return {
      status: 'QUEUED',
      workflowInstanceId: outcome.workflow_instance_id,
      profilingRunId,
      agentRunId,
      durableJobId: durableJob.id,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Automatic remediation verification scheduling failed.'

    if (!jobEnqueued) {
      if (profilingRunId) {
        await admin.schema('profiling').from('profile_runs').update({
          status: 'FAILED',
          error_code: 'REMEDIATION_VERIFICATION_QUEUE_FAILED',
          error_message: message,
          completed_at: new Date().toISOString(),
        }).eq('id', profilingRunId).eq('status', 'RUNNING')
      }
      if (agentRunId) {
        await admin.schema('agent').from('agent_runs').update({
          status: 'FAILED',
          error_code: 'REMEDIATION_VERIFICATION_QUEUE_FAILED',
          error_message: message,
          completed_at: new Date().toISOString(),
        }).eq('id', agentRunId).in('status', ['CREATED', 'QUEUED'])
      }
      await admin.schema('governance').from('profiling_remediation_outcomes').update({
        status: 'ACTION_TRACKED',
        verification_profile_run_id: null,
        verification_agent_run_id: null,
        verification_job_id: null,
        verification_requested_at: null,
        verification_requested_by: null,
        updated_at: new Date().toISOString(),
        outcome: {
          ...initialOutcome,
          verification_generation: verificationGeneration,
          verification_queue_phase: 'QUEUE_FAILED',
          verification_queue_error: message,
        },
      }).eq('workflow_instance_id', outcome.workflow_instance_id)
    } else {
      await admin.schema('governance').from('profiling_remediation_outcomes').update({
        status: 'VERIFICATION_QUEUED',
        updated_at: new Date().toISOString(),
        outcome: {
          ...initialOutcome,
          verification_generation: verificationGeneration,
          verification_queue_phase: 'JOB_ENQUEUED_LINKAGE_PENDING',
          verification_linkage_error: message,
        },
      }).eq('workflow_instance_id', outcome.workflow_instance_id)
    }

    await writeGovernanceAudit({
      projectId: input.projectId,
      actorUserId: input.userId,
      eventType: jobEnqueued ? 'PROFILING_REMEDIATION_REPROFILE_LINKAGE_FAILED' : 'PROFILING_REMEDIATION_REPROFILE_QUEUE_FAILED',
      entityType: 'PROFILE_RUN',
      entityId: profilingRunId ?? outcome.source_profile_run_id,
      correlationId: outcome.workflow_instance_id,
      metadata: {
        workflow_instance_id: outcome.workflow_instance_id,
        verification_profile_run_id: profilingRunId,
        verification_agent_run_id: agentRunId,
        verification_generation: verificationGeneration,
        job_enqueued: jobEnqueued,
        error: message,
      },
    })
    throw error
  }
}
