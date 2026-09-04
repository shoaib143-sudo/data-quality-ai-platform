import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueDurableJob } from '@/lib/orchestration/queue'
import { queueDataQualityAutomation } from '@/lib/data-quality/queue'
import { writeGovernanceAudit } from '@/lib/governance/audit'

const PROFILING_AGENT_KEY = 'profiling_agent'
const PROFILING_AGENT_VERSION = '2.0'
const PROFILING_ENGINE_NAME = 'profiling-engine'
const PROFILING_ENGINE_VERSION = '1.1'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function uuidList(value: unknown) { return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [] }

export async function scheduleFreshDataQualityVerificationFromIssue(input: {
  issueId: string
  projectId: string
  userId: string
}) {
  const admin = createAdminClient()
  const { data: outcome, error: outcomeError } = await admin.schema('governance').from('data_quality_remediation_outcomes')
    .select('id,project_id,workflow_instance_id,investigation_id,source_agent_run_id,remediation_issue_ids,status,verification_profile_run_id,verification_profiling_agent_run_id,verification_profile_job_id,verification_agent_run_id,verification_job_id,verification_generation')
    .eq('project_id', input.projectId)
    .contains('remediation_issue_ids', [input.issueId])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (outcomeError) throw new Error(`Unable to resolve data quality remediation outcome: ${outcomeError.message}`)
  if (!outcome) return { status: 'NOT_DATA_QUALITY_REMEDIATION' as const }

  if (['VERIFIED', 'VERIFICATION_FAILED'].includes(outcome.status)) {
    return {
      status: 'ALREADY_VERIFIED' as const,
      workflowInstanceId: outcome.workflow_instance_id,
      verificationProfileRunId: outcome.verification_profile_run_id,
      verificationAgentRunId: outcome.verification_agent_run_id,
      durableJobId: outcome.verification_job_id,
    }
  }

  const issueIds = uuidList(outcome.remediation_issue_ids)
  const { data: issues, error: issuesError } = issueIds.length
    ? await admin.schema('governance').from('issues').select('id,status').in('id', issueIds)
    : { data: [], error: null }
  if (issuesError) throw new Error(`Unable to resolve data quality remediation issues: ${issuesError.message}`)
  const unresolvedIssueIds = issueIds.filter((id) => !(issues ?? []).some((issue) => issue.id === id && ['RESOLVED', 'CLOSED'].includes(text(issue.status).toUpperCase())))
  if (unresolvedIssueIds.length || !issueIds.length) {
    await admin.schema('governance').from('data_quality_remediation_outcomes').update({ status: 'WAITING_FOR_REMEDIATION', updated_at: new Date().toISOString() }).eq('id', outcome.id)
    return { status: 'WAITING_FOR_REMEDIATION' as const, workflowInstanceId: outcome.workflow_instance_id, unresolvedIssueIds }
  }

  if (outcome.verification_profile_job_id) {
    const { data: existingJob, error: existingJobError } = await admin.schema('orchestration').from('job_queue').select('id,status,agent_run_id').eq('id', outcome.verification_profile_job_id).maybeSingle()
    if (existingJobError) throw new Error(`Unable to resolve fresh profile verification job: ${existingJobError.message}`)
    if (existingJob && ['QUEUED', 'RUNNING', 'SUCCEEDED'].includes(existingJob.status)) {
      return {
        status: 'ALREADY_QUEUED' as const,
        workflowInstanceId: outcome.workflow_instance_id,
        verificationProfileRunId: outcome.verification_profile_run_id,
        profilingAgentRunId: outcome.verification_profiling_agent_run_id,
        durableJobId: existingJob.id,
        jobStatus: existingJob.status,
      }
    }
  }

  const { data: investigation, error: investigationError } = await admin.schema('governance').from('data_quality_investigations')
    .select('id,dataset_id,dataset_version_id,profile_run_id')
    .eq('id', outcome.investigation_id).maybeSingle()
  if (investigationError || !investigation) throw new Error(`Unable to load data quality investigation for reprofile verification: ${investigationError?.message ?? 'not found'}`)

  const { data: candidateVersions, error: candidateError } = await admin.schema('catalog').from('dataset_versions')
    .select('id,dataset_id,version_number,status')
    .eq('dataset_id', investigation.dataset_id)
    .eq('status', 'AVAILABLE')
    .order('version_number', { ascending: false })
    .limit(20)
  if (candidateError) throw new Error(`Unable to resolve verification dataset versions: ${candidateError.message}`)
  const candidateIds = (candidateVersions ?? []).map((version) => version.id)
  if (!candidateIds.length) throw new Error('No AVAILABLE dataset version exists for Data Quality verification.')

  const { data: sources, error: sourceError } = await admin.schema('profiling').from('dataset_execution_sources')
    .select('dataset_version_id,active').in('dataset_version_id', candidateIds).eq('active', true)
  if (sourceError) throw new Error(`Unable to resolve executable verification source: ${sourceError.message}`)
  const executable = new Set((sources ?? []).map((source) => source.dataset_version_id))
  const verificationVersion = (candidateVersions ?? []).find((version) => executable.has(version.id))
  if (!verificationVersion) throw new Error('No AVAILABLE dataset version has an active profiling execution source for Data Quality verification.')

  const { data: agentDefinition, error: agentError } = await admin.schema('agent').from('agent_definitions')
    .select('id,agent_key,version,enabled')
    .eq('agent_key', PROFILING_AGENT_KEY).eq('version', PROFILING_AGENT_VERSION).eq('enabled', true).maybeSingle()
  if (agentError || !agentDefinition) throw new Error(`Unable to resolve profiling agent for Data Quality verification: ${agentError?.message ?? 'not found'}`)

  const generation = Number(outcome.verification_generation ?? 0) + 1
  const requestInput = {
    trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION_PROFILE',
    automaticVerification: true,
    workflowInstanceId: outcome.workflow_instance_id,
    sourceDataQualityAgentRunId: outcome.source_agent_run_id,
    sourceProfileRunId: investigation.profile_run_id,
    datasetVersionId: verificationVersion.id,
    verificationGeneration: generation,
  }

  let profilingAgentRunId: string | null = null
  let verificationProfileRunId: string | null = null
  try {
    const { data: agentRun, error: agentRunError } = await admin.schema('agent').from('agent_runs').insert({
      agent_definition_id: agentDefinition.id,
      project_id: input.projectId,
      dataset_id: investigation.dataset_id,
      dataset_version_id: verificationVersion.id,
      parent_run_id: outcome.source_agent_run_id,
      status: 'QUEUED',
      input: requestInput,
    }).select('id').single()
    if (agentRunError || !agentRun) throw new Error(`Unable to create Data Quality verification profiling agent run: ${agentRunError?.message ?? 'unknown error'}`)
    profilingAgentRunId = agentRun.id

    const { data: profileRun, error: profileRunError } = await admin.schema('profiling').from('profile_runs').insert({
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
        trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION_PROFILE',
        workflow_instance_id: outcome.workflow_instance_id,
        source_data_quality_agent_run_id: outcome.source_agent_run_id,
        verification_generation: generation,
      },
      started_at: new Date().toISOString(),
    }).select('id').single()
    if (profileRunError || !profileRun) throw new Error(`Unable to create fresh profiling run for Data Quality verification: ${profileRunError?.message ?? 'unknown error'}`)
    verificationProfileRunId = profileRun.id

    const durableJob = await enqueueDurableJob({
      projectId: input.projectId,
      jobType: 'PROFILING',
      entityId: verificationVersion.id,
      agentRunId: agentRun.id,
      idempotencyKey: `data-quality:verification-profile:${outcome.workflow_instance_id}:${generation}`,
      payload: {
        userId: input.userId,
        projectId: input.projectId,
        datasetVersionId: verificationVersion.id,
        agentDefinitionId: agentDefinition.id,
        agentVersion: agentDefinition.version,
        agentRunId: agentRun.id,
        profilingRunId: profileRun.id,
        requestInput,
      },
      priority: 90,
      maxAttempts: 3,
    })

    const now = new Date().toISOString()
    const { error: persistError } = await admin.schema('governance').from('data_quality_remediation_outcomes').update({
      status: 'VERIFICATION_QUEUED',
      verification_profile_run_id: profileRun.id,
      verification_profiling_agent_run_id: agentRun.id,
      verification_profile_job_id: durableJob.id,
      verification_agent_run_id: null,
      verification_job_id: null,
      verification_requested_at: now,
      verification_generation: generation,
      outcome: {
        verification_phase: 'FRESH_PROFILE_QUEUED',
        verification_dataset_version_id: verificationVersion.id,
        verification_generation: generation,
      },
      updated_at: now,
      verified_at: null,
    }).eq('id', outcome.id)
    if (persistError) throw new Error(`Unable to persist Data Quality fresh profile verification linkage: ${persistError.message}`)

    await writeGovernanceAudit({
      projectId: input.projectId,
      actorUserId: input.userId,
      eventType: 'DATA_QUALITY_REMEDIATION_REPROFILE_QUEUED',
      entityType: 'DATA_QUALITY_RUN',
      entityId: outcome.source_agent_run_id,
      correlationId: outcome.workflow_instance_id,
      metadata: {
        verification_profile_run_id: profileRun.id,
        verification_profiling_agent_run_id: agentRun.id,
        verification_profile_job_id: durableJob.id,
        verification_dataset_version_id: verificationVersion.id,
        verification_generation: generation,
      },
    })

    return {
      status: 'QUEUED' as const,
      workflowInstanceId: outcome.workflow_instance_id,
      verificationProfileRunId: profileRun.id,
      profilingAgentRunId: agentRun.id,
      durableJobId: durableJob.id,
      verificationGeneration: generation,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to schedule fresh Data Quality verification profile.'
    if (verificationProfileRunId) await admin.schema('profiling').from('profile_runs').update({ status: 'FAILED', error_code: 'DQ_VERIFICATION_PROFILE_QUEUE_FAILED', error_message: message, completed_at: new Date().toISOString() }).eq('id', verificationProfileRunId).neq('status', 'CANCELLED')
    if (profilingAgentRunId) await admin.schema('agent').from('agent_runs').update({ status: 'FAILED', error_code: 'DQ_VERIFICATION_PROFILE_QUEUE_FAILED', error_message: message, completed_at: new Date().toISOString() }).eq('id', profilingAgentRunId).neq('status', 'CANCELLED')
    throw error
  }
}

export async function queueDataQualityVerificationAfterFreshProfile(input: {
  workflowInstanceId: string
  verificationProfileRunId: string
  userId: string
}) {
  const admin = createAdminClient()
  const { data: outcome, error: outcomeError } = await admin.schema('governance').from('data_quality_remediation_outcomes')
    .select('id,project_id,workflow_instance_id,investigation_id,source_agent_run_id,verification_profile_run_id,verification_generation,verification_agent_run_id,verification_job_id')
    .eq('workflow_instance_id', input.workflowInstanceId).maybeSingle()
  if (outcomeError || !outcome) throw new Error(`Unable to resolve Data Quality outcome after fresh profiling: ${outcomeError?.message ?? 'not found'}`)
  if (outcome.verification_profile_run_id !== input.verificationProfileRunId) throw new Error('Fresh profiling run does not match the governed Data Quality verification linkage.')

  if (outcome.verification_job_id && outcome.verification_agent_run_id) {
    const { data: existingJob, error: existingJobError } = await admin.schema('orchestration').from('job_queue').select('id,status').eq('id', outcome.verification_job_id).maybeSingle()
    if (existingJobError) throw new Error(`Unable to resolve existing Data Quality verification job: ${existingJobError.message}`)
    if (existingJob && ['QUEUED', 'RUNNING', 'SUCCEEDED'].includes(existingJob.status)) return { status: 'ALREADY_QUEUED' as const, agentRunId: outcome.verification_agent_run_id, durableJobId: existingJob.id }
  }

  const [{ data: profileRun, error: profileError }, { data: investigation, error: investigationError }] = await Promise.all([
    admin.schema('profiling').from('profile_runs').select('id,dataset_version_id,status').eq('id', input.verificationProfileRunId).maybeSingle(),
    admin.schema('governance').from('data_quality_investigations').select('id,dataset_id').eq('id', outcome.investigation_id).maybeSingle(),
  ])
  if (profileError || !profileRun) throw new Error(`Unable to resolve fresh profile for Data Quality verification: ${profileError?.message ?? 'not found'}`)
  if (profileRun.status !== 'COMPLETED') throw new Error(`Fresh Data Quality verification profile must be COMPLETED, received ${profileRun.status}.`)
  if (investigationError || !investigation) throw new Error(`Unable to resolve Data Quality investigation after fresh profiling: ${investigationError?.message ?? 'not found'}`)

  const generation = Number(outcome.verification_generation ?? 1)
  const queued = await queueDataQualityAutomation({
    projectId: outcome.project_id,
    datasetId: investigation.dataset_id,
    datasetVersionId: profileRun.dataset_version_id,
    profileRunId: profileRun.id,
    userId: input.userId,
    parentRunId: outcome.source_agent_run_id,
    trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION',
    workflowInstanceId: outcome.workflow_instance_id,
    verificationGeneration: generation,
    idempotencyKey: `data-quality:remediation-verification:${outcome.workflow_instance_id}:${generation}`,
  })

  const now = new Date().toISOString()
  const { error: updateError } = await admin.schema('governance').from('data_quality_remediation_outcomes').update({
    status: 'VERIFICATION_QUEUED',
    verification_agent_run_id: queued.agentRunId,
    verification_job_id: queued.durableJobId,
    outcome: {
      verification_phase: 'DATA_QUALITY_QUEUED',
      verification_profile_run_id: profileRun.id,
      verification_dataset_version_id: profileRun.dataset_version_id,
      verification_generation: generation,
      data_quality_verification_job_id: queued.durableJobId,
    },
    updated_at: now,
  }).eq('id', outcome.id)
  if (updateError) throw new Error(`Unable to link Data Quality verification job after fresh profiling: ${updateError.message}`)

  await writeGovernanceAudit({
    projectId: outcome.project_id,
    actorUserId: input.userId,
    eventType: 'DATA_QUALITY_REMEDIATION_VERIFICATION_QUEUED',
    entityType: 'DATA_QUALITY_RUN',
    entityId: queued.agentRunId,
    correlationId: outcome.workflow_instance_id,
    metadata: {
      source_agent_run_id: outcome.source_agent_run_id,
      verification_profile_run_id: profileRun.id,
      verification_agent_run_id: queued.agentRunId,
      verification_job_id: queued.durableJobId,
      verification_generation: generation,
    },
  })

  return { status: queued.reused ? 'ALREADY_QUEUED' as const : 'QUEUED' as const, agentRunId: queued.agentRunId, durableJobId: queued.durableJobId, verificationGeneration: generation }
}
