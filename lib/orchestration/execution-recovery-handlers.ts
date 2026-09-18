import { revalidateAndReconcileSourceForProfiling } from '@/lib/profiling/source-readiness-repair'
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
        && (context.failingStage === 'SOURCE_READINESS' || context.failingStage === 'SOURCE_ONBOARDING')
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
