import type { RecoveryFailureContext } from './execution-recovery-contract'
import type { RecoveryHandler } from './execution-recovery-runtime'

type SourceRepairResult = {
  operational: boolean
  code?: string | null
  validation?: unknown
}

type ProfilingReadinessRepairResult = {
  status: string
  executed: boolean
  approval_required: boolean
  after_state: string
  readiness: Record<string, unknown>
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readinessPassed(value: Record<string, unknown>) {
  return text(value.state).toUpperCase() === 'READY' && value.profiling_ready === true
}

export function createSourceReadinessRecoveryHandler(input: {
  repair: (args: { projectId: string; sourceId: string }) => Promise<SourceRepairResult>
  verify: (args: { projectId: string; sourceId: string }) => Promise<{ valid: boolean; code: string }>
}): RecoveryHandler {
  const applied = new Set<string>()

  function sourceId(context: RecoveryFailureContext) {
    return text(context.repairParameters?.sourceId)
  }

  return {
    key: 'source-readiness-reconciliation',

    canHandle(context) {
      return context.knownRepairClass === 'SOURCE_READINESS_RECONCILIATION'
        && Boolean(sourceId(context))
        && ['CONNECTOR_ESTABLISHMENT', 'SOURCE_READINESS', 'SOURCE_ONBOARDING'].includes(context.failingStage)
    },

    async diagnose(context) {
      const id = sourceId(context)
      if (!id) throw new Error('Source readiness repair requires a sourceId.')
      return {
        rootCause: `Persisted connector/readiness evidence indicates source ${id} requires bounded revalidation and reconciliation.`,
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
      if (proposed.repairClass !== 'SOURCE_READINESS_RECONCILIATION') throw new Error('Unexpected repair class for source readiness handler.')
      await input.repair({ projectId: context.projectId, sourceId: id })
      applied.add(context.recoveryCaseId)
      return { mutationId: `source-readiness:${context.recoveryCaseId}:${id}` }
    },

    async validate(context) {
      if (!applied.has(context.recoveryCaseId)) return { valid: false, code: 'SOURCE_REPAIR_EVIDENCE_MISSING' }
      const id = sourceId(context)
      const verification = await input.verify({ projectId: context.projectId, sourceId: id })
      return {
        valid: verification.valid,
        code: verification.code,
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    sameStageRetrySafe() {
      return true
    },
  }
}

export function createProfilingReadinessRecoveryHandler(input: {
  repair: (args: { projectId: string; datasetVersionId: string; agentRunId: string }) => Promise<ProfilingReadinessRepairResult>
  verify: (args: { projectId: string; datasetVersionId: string }) => Promise<Record<string, unknown>>
}): RecoveryHandler {
  const applied = new Set<string>()

  function parameters(context: RecoveryFailureContext) {
    return {
      datasetVersionId: text(context.repairParameters?.datasetVersionId),
      agentRunId: text(context.repairParameters?.agentRunId) || context.workflowRunId,
    }
  }

  return {
    key: 'profiling-readiness-reconciliation',

    canHandle(context) {
      const values = parameters(context)
      return context.knownRepairClass === 'PROFILING_READINESS_RECONCILIATION'
        && Boolean(values.datasetVersionId)
        && ['PROFILE_RUN', 'SCHEMA_DISCOVERY', 'PROFILE_COLUMNS', 'METRIC_EXECUTION'].includes(context.failingStage)
    },

    async diagnose(context) {
      const values = parameters(context)
      if (!values.datasetVersionId) throw new Error('Profiling readiness repair requires a datasetVersionId.')
      return {
        rootCause: `Persisted profiling evidence indicates dataset version ${values.datasetVersionId} is blocked by the deterministic readiness gate.`,
        repairClass: 'PROFILING_READINESS_RECONCILIATION',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    async proposeRepair(context) {
      const values = parameters(context)
      if (!values.datasetVersionId) throw new Error('Profiling readiness repair requires a datasetVersionId.')
      return {
        repairClass: 'PROFILING_READINESS_RECONCILIATION',
        toolKey: 'executeProfileReadinessRemediation',
        mutationScope: `project:${context.projectId}:dataset-version:${values.datasetVersionId}`,
        payload: { projectId: context.projectId, datasetVersionId: values.datasetVersionId, agentRunId: values.agentRunId },
      }
    },

    async apply(context, proposed) {
      const values = parameters(context)
      if (!values.datasetVersionId) throw new Error('Profiling readiness repair requires a datasetVersionId.')
      if (proposed.repairClass !== 'PROFILING_READINESS_RECONCILIATION') throw new Error('Unexpected repair class for profiling readiness handler.')
      const result = await input.repair({ projectId: context.projectId, datasetVersionId: values.datasetVersionId, agentRunId: values.agentRunId })
      if (result.approval_required) throw new Error('Profiling readiness remediation requires approval.')
      if (!['REMEDIATED', 'ALREADY_READY'].includes(result.status)) throw new Error(`Profiling readiness remediation did not restore readiness: ${result.status}`)
      applied.add(context.recoveryCaseId)
      return { mutationId: `profiling-readiness:${context.recoveryCaseId}:${values.datasetVersionId}` }
    },

    async validate(context) {
      if (!applied.has(context.recoveryCaseId)) return { valid: false, code: 'PROFILING_REPAIR_EVIDENCE_MISSING' }
      const values = parameters(context)
      const readiness = await input.verify({ projectId: context.projectId, datasetVersionId: values.datasetVersionId })
      return {
        valid: readinessPassed(readiness),
        code: readinessPassed(readiness) ? 'PROFILING_READINESS_RESTORED' : 'PROFILING_READINESS_STILL_BLOCKED',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    sameStageRetrySafe() {
      return true
    },
  }
}


export function createLeaseReconciliationRecoveryHandler(input: {
  reconcile: (args: { projectId: string; durableJobId: string }) => Promise<{ reconciled: boolean }>
  verify: (args: { projectId: string; durableJobId: string }) => Promise<{ status: string; leaseOwner: string | null; leaseExpiresAt: string | null }>
}): RecoveryHandler {
  const reconciled = new Set<string>()

  function durableJobId(context: RecoveryFailureContext) {
    return text(context.repairParameters?.durableJobId)
  }

  return {
    key: 'lease-reconciliation',

    canHandle(context) {
      return context.knownRepairClass === 'LEASE_RECONCILIATION'
        && Boolean(durableJobId(context))
        && context.failingStage === 'GOVERNED_WORKFLOW'
    },

    async diagnose(context) {
      const id = durableJobId(context)
      if (!id) throw new Error('Lease reconciliation requires a durableJobId.')
      return {
        rootCause: `Persisted orchestration evidence indicates durable job ${id} has a stale or inconsistent worker lease.`,
        repairClass: 'LEASE_RECONCILIATION',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    async proposeRepair(context) {
      const id = durableJobId(context)
      if (!id) throw new Error('Lease reconciliation requires a durableJobId.')
      return {
        repairClass: 'LEASE_RECONCILIATION',
        toolKey: 'reconcileDurableJobLease',
        mutationScope: `project:${context.projectId}:durable-job:${id}:lease`,
        payload: { projectId: context.projectId, durableJobId: id },
      }
    },

    async apply(context, proposed) {
      const id = durableJobId(context)
      if (!id) throw new Error('Lease reconciliation requires a durableJobId.')
      if (proposed.repairClass !== 'LEASE_RECONCILIATION') throw new Error('Unexpected repair class for lease reconciliation handler.')
      const result = await input.reconcile({ projectId: context.projectId, durableJobId: id })
      if (!result.reconciled) throw new Error('Durable job lease reconciliation did not apply.')
      reconciled.add(context.recoveryCaseId)
      return { mutationId: `lease-reconciliation:${context.recoveryCaseId}:${id}` }
    },

    async validate(context) {
      if (!reconciled.has(context.recoveryCaseId)) return { valid: false, code: 'LEASE_REPAIR_EVIDENCE_MISSING' }
      const id = durableJobId(context)
      const state = await input.verify({ projectId: context.projectId, durableJobId: id })
      const valid = state.status === 'DEAD' && state.leaseOwner === null && state.leaseExpiresAt === null
      return {
        valid,
        code: valid ? 'DURABLE_JOB_LEASE_RECONCILED' : 'DURABLE_JOB_LEASE_STILL_ACTIVE',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    sameStageRetrySafe() {
      return true
    },
  }
}
