import type { DurableJobType } from './queue.ts'
import type { RecoveryRepairClass, RecoveryStage } from './execution-recovery-contract.ts'

export type TerminalRecoveryRoute = {
  repairClass: RecoveryRepairClass | null
  stage: RecoveryStage
}

const LEASE_RETRY_SAFE_JOB_TYPES = new Set<DurableJobType>([
  'PROFILING',
  'OBSERVABILITY',
  'DISCOVERY',
  'LINEAGE_ENRICHMENT',
  'SEMANTIC_INDEX',
  'GOVERNANCE_AGENT',
])

export function recoveryStageFromFailure(jobType: DurableJobType, message: string): RecoveryStage {
  if (/lease expired|orphaned|worker lease|stale lease|lease timeout/i.test(message)) return 'GOVERNED_WORKFLOW'
  if (jobType === 'DISCOVERY') {
    return /connect|jdbc|network|socket|timeout/i.test(message)
      ? 'CONNECTOR_ESTABLISHMENT'
      : 'SOURCE_READINESS'
  }
  if (/schema discovery|schema snapshot|schema hash/i.test(message)) return 'SCHEMA_DISCOVERY'
  if (/profile column|column registration/i.test(message)) return 'PROFILE_COLUMNS'
  if (/metric/i.test(message)) return 'METRIC_EXECUTION'
  return 'PROFILE_RUN'
}

export function classifyTerminalRecoveryRoute(jobType: DurableJobType, message: string): TerminalRecoveryRoute | null {
  const governedException = recoveryUnsafeFlags(message)
  if (
    governedException.securityRelevant
    || governedException.credentialMissing
    || governedException.privilegeExpansionRequired
    || governedException.destructiveMutationRequired
    || governedException.policyBlocked
  ) {
    return { repairClass: null, stage: recoveryStageFromFailure(jobType, message) }
  }

  if (
    LEASE_RETRY_SAFE_JOB_TYPES.has(jobType)
    && /lease expired|orphaned|worker lease|stale lease|lease timeout/i.test(message)
  ) {
    return { repairClass: 'LEASE_RECONCILIATION', stage: 'GOVERNED_WORKFLOW' }
  }

  if (
    jobType === 'PROFILING'
    && /PROFILE_READINESS_GATE_BLOCKED|profiling readiness|dataset_not_found|dataset_version_not_latest|source_not_observed_ready|execution_source_not_bound/i.test(message)
  ) {
    return {
      repairClass: 'PROFILING_READINESS_RECONCILIATION',
      stage: recoveryStageFromFailure(jobType, message),
    }
  }

  if (
    jobType === 'DISCOVERY'
    && /connect|jdbc|network|socket|timeout|source validation|schema availability|readiness/i.test(message)
  ) {
    return {
      repairClass: 'SOURCE_READINESS_RECONCILIATION',
      stage: recoveryStageFromFailure(jobType, message),
    }
  }

  return null
}

export function recoveryUnsafeFlags(message: string) {
  return {
    credentialMissing: /(credential|secret).*(missing|not found|unknown|unavailable)|(missing|unknown).*(credential|secret)/i.test(message),
    privilegeExpansionRequired: /grant\s|privilege expansion|requires elevated privilege/i.test(message),
    destructiveMutationRequired: /\b(drop|truncate)\b.*\b(table|schema|database)\b/i.test(message),
    policyBlocked: /policy denied|policy blocked|approval required|forbidden|access denied|not authorized/i.test(message),
    securityRelevant: /security|cross[-_ ]project|cross[-_ ]tenant|tenant violation/i.test(message),
  }
}
