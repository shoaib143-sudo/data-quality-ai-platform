import { revalidateAndReconcileSourceForProfiling } from '@/lib/profiling/source-readiness-repair'
import { executeProfileReadinessRemediation } from '@/lib/profiling/readiness-remediation-agent'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RecoveryHandler } from './execution-recovery-runtime'
import type { RecoveryFailureContext } from './execution-recovery-contract'

type SourceRepairResult = Awaited<ReturnType<typeof revalidateAndReconcileSourceForProfiling>>

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function createSourceReadinessRecoveryHandler(input?: {
  repair?: typeof revalidateAndReconcileSourceForProfiling
}): RecoveryHandler {
  const repair = input?.repair ?? revalidateAndReconcileSourceForProfiling
  const applied = new Map<string, SourceRepairResult>()

  function sourceId(context: RecoveryFailureContext) {
    return text(context.repairParameters?.sourceId)
  }

  return {
    key: 'source-readiness-reconciliation',

    canHandle(context) {
      return context.knownRepairClass === 'SOURCE_READINESS_RECONCILIATION'
        && Boolean(sourceId(context))
        && (context.failingStage === 'CONNECTOR_ESTABLISHMENT' || context.failingStage === 'SOURCE_READINESS' || context.failingStage === 'SOURCE_ONBOARDING' || context.failingStage === 'METRIC_EXECUTION')
    },

    async diagnose(context) {
      const id = sourceId(context)
      if (!id) throw new Error('Source readiness repair requires a sourceId.')
      return {
        rootCause: `Persisted readiness evidence indicates source ${id} requires bounded revalidation and reconciliation.`,
        repairClass: 'SOURCE_READINESS_RECONCILIATION',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    async proposeRepair(context) {
      const id = sourceId(context)
      if (!id) throw new Error('Source readiness repair requires a sourceId.')
      return {
        repairClass: 'SOURCE_READINESS_RECONCILIATION',
        toolKey: 'revalidateAndReconcileSourceForProfiling',
        mutationScope: `project:${context.projectId}:source:${id}`,
        payload: { projectId: context.projectId, sourceId: id },
      }
    },

    async apply(context, proposed) {
      const id = sourceId(context)
      if (!id) throw new Error('Source readiness repair requires a sourceId.')
      if (proposed.repairClass !== 'SOURCE_READINESS_RECONCILIATION') {
        throw new Error('Unexpected repair class for source readiness handler.')
      }
      const result = await repair({ projectId: context.projectId, sourceId: id })
      applied.set(context.recoveryCaseId, result)
      return { mutationId: `source-readiness:${context.recoveryCaseId}:${id}` }
    },

    async validate(context) {
      const result = applied.get(context.recoveryCaseId)
      if (!result) return { valid: false, code: 'SOURCE_REPAIR_EVIDENCE_MISSING' }
      return {
        valid: result.operational === true,
        code: result.operational === true ? 'SOURCE_READINESS_RESTORED' : result.code || 'SOURCE_READINESS_STILL_BLOCKED',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    sameStageRetrySafe() {
      return true
    },
  }
}

type ProfileReadinessRepairResult = Awaited<ReturnType<typeof executeProfileReadinessRemediation>>

export function createProfileReadinessRecoveryHandler(input?: {
  repair?: typeof executeProfileReadinessRemediation
}): RecoveryHandler {
  const repair = input?.repair ?? executeProfileReadinessRemediation
  const applied = new Map<string, ProfileReadinessRepairResult>()

  function datasetVersionId(context: RecoveryFailureContext) {
    return text(context.repairParameters?.datasetVersionId)
  }

  function agentRunId(context: RecoveryFailureContext) {
    return text(context.repairParameters?.agentRunId)
  }

  return {
    key: 'profiling-readiness-reconciliation',

    canHandle(context) {
      return context.knownRepairClass === 'PROFILING_READINESS_RECONCILIATION'
        && context.failingStage === 'PROFILE_RUN'
        && Boolean(datasetVersionId(context))
        && Boolean(agentRunId(context))
    },

    async diagnose(context) {
      const versionId = datasetVersionId(context)
      if (!versionId) throw new Error('Profiling readiness repair requires a datasetVersionId.')
      return {
        rootCause: `Persisted profile-readiness evidence indicates dataset version ${versionId} is blocked by an authorized low-risk readiness defect.`,
        repairClass: 'PROFILING_READINESS_RECONCILIATION',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    async proposeRepair(context) {
      const versionId = datasetVersionId(context)
      const runId = agentRunId(context)
      if (!versionId || !runId) throw new Error('Profiling readiness repair requires datasetVersionId and agentRunId.')
      return {
        repairClass: 'PROFILING_READINESS_RECONCILIATION',
        toolKey: 'executeProfileReadinessRemediation',
        mutationScope: `project:${context.projectId}:dataset-version:${versionId}`,
        payload: { projectId: context.projectId, datasetVersionId: versionId, agentRunId: runId },
      }
    },

    async apply(context, proposed) {
      const versionId = datasetVersionId(context)
      const runId = agentRunId(context)
      if (!versionId || !runId) throw new Error('Profiling readiness repair requires datasetVersionId and agentRunId.')
      if (proposed.repairClass !== 'PROFILING_READINESS_RECONCILIATION') {
        throw new Error('Unexpected repair class for profiling readiness handler.')
      }
      const result = await repair({ projectId: context.projectId, datasetVersionId: versionId, agentRunId: runId })
      applied.set(context.recoveryCaseId, result)
      return { mutationId: `profiling-readiness:${context.recoveryCaseId}:${versionId}` }
    },

    async validate(context) {
      const result = applied.get(context.recoveryCaseId)
      if (!result) return { valid: false, code: 'PROFILE_READINESS_REPAIR_EVIDENCE_MISSING' }
      const readiness = result.readiness && typeof result.readiness === 'object' && !Array.isArray(result.readiness)
        ? result.readiness as Record<string, unknown>
        : {}
      const valid = readiness.state === 'READY' && readiness.profiling_ready === true
      return {
        valid,
        code: valid ? 'PROFILE_READINESS_RESTORED' : 'PROFILE_READINESS_STILL_BLOCKED',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    sameStageRetrySafe() {
      return true
    },
  }
}

export function createRetrySafeRuntimeRecoveryHandler(): RecoveryHandler {
  function durableJobId(context: RecoveryFailureContext) {
    return text(context.repairParameters?.durableJobId)
  }

  return {
    key: 'retry-safe-runtime-repair',

    canHandle(context) {
      return context.knownRepairClass === 'RETRY_SAFE_RUNTIME_REPAIR'
        && ['GOVERNED_WORKFLOW', 'METRIC_PERSISTENCE', 'FINDINGS_GENERATION', 'QUALITY_SCORING', 'GOVERNANCE_INSIGHTS'].includes(context.failingStage)
        && Boolean(durableJobId(context))
    },

    async diagnose(context) {
      const jobId = durableJobId(context)
      if (!jobId) throw new Error('Runtime recovery requires a durableJobId.')
      const admin = createAdminClient()
      const { data, error } = await admin.schema('orchestration').from('job_queue')
        .select('id,project_id,status,lease_owner,lease_expires_at,attempts,max_attempts,last_error')
        .eq('id', jobId)
        .eq('project_id', context.projectId)
        .maybeSingle()
      if (error) throw new Error(`Unable to load durable runtime evidence: ${error.message}`)
      if (!data) throw new Error('Durable runtime evidence was not found in project scope.')
      if (data.status !== 'DEAD') throw new Error(`Durable job is ${data.status}; retry-safe runtime repair requires DEAD evidence.`)
      return {
        rootCause: `Durable job ${jobId} exhausted bounded execution after a retry-safe runtime or lease failure.`,
        repairClass: 'RETRY_SAFE_RUNTIME_REPAIR',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    async proposeRepair(context) {
      const jobId = durableJobId(context)
      if (!jobId) throw new Error('Runtime recovery requires a durableJobId.')
      return {
        repairClass: 'RETRY_SAFE_RUNTIME_REPAIR',
        toolKey: 'reconcileDurableRuntimeLease',
        mutationScope: `project:${context.projectId}:durable-job:${jobId}`,
        payload: { durableJobId: jobId, projectId: context.projectId },
      }
    },

    async apply(context, proposed) {
      const jobId = durableJobId(context)
      if (!jobId) throw new Error('Runtime recovery requires a durableJobId.')
      if (proposed.repairClass !== 'RETRY_SAFE_RUNTIME_REPAIR') {
        throw new Error('Unexpected repair class for retry-safe runtime handler.')
      }
      const admin = createAdminClient()
      const { data, error } = await admin.schema('orchestration').from('job_queue').update({
        lease_owner: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId).eq('project_id', context.projectId).eq('status', 'DEAD')
        .select('id')
        .maybeSingle()
      if (error) throw new Error(`Unable to reconcile durable runtime lease: ${error.message}`)
      if (!data) throw new Error('Durable runtime repair lost its terminal job scope.')
      return { mutationId: `durable-runtime:${context.recoveryCaseId}:${jobId}` }
    },

    async validate(context) {
      const jobId = durableJobId(context)
      if (!jobId) return { valid: false, code: 'DURABLE_JOB_ID_MISSING' }
      const admin = createAdminClient()
      const { data, error } = await admin.schema('orchestration').from('job_queue')
        .select('id,status,lease_owner,lease_expires_at')
        .eq('id', jobId)
        .eq('project_id', context.projectId)
        .maybeSingle()
      if (error || !data) return { valid: false, code: 'DURABLE_RUNTIME_VALIDATION_UNAVAILABLE' }
      const valid = data.status === 'DEAD' && data.lease_owner === null && data.lease_expires_at === null
      return {
        valid,
        code: valid ? 'DURABLE_RUNTIME_RECONCILED' : 'DURABLE_RUNTIME_STILL_UNSAFE',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    sameStageRetrySafe() {
      return true
    },
  }
}
