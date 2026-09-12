export type DataQualityVerificationExpectation = {
  workflowInstanceId: string
  verificationAgentRunId: string | null
  verificationProfileRunId: string | null
  verificationGeneration: number | null
}

export type DataQualityVerificationCandidate = {
  agentRunId: string
  input: Record<string, unknown>
}

export class DataQualityVerificationBindingError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'DataQualityVerificationBindingError'
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function integer(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isInteger(Number(value))) return Number(value)
  return null
}

/**
 * Binds a verification verdict to the exact remediation workflow evidence.
 *
 * Historical generation-0 outcomes predate workflow/generation metadata in
 * agent input, so exact persisted agent/profile identity remains authoritative
 * for those rows. Current generations additionally require workflow, generation,
 * and governed verification trigger metadata.
 */
export function assertDataQualityVerificationBinding(
  expected: DataQualityVerificationExpectation,
  candidate: DataQualityVerificationCandidate,
) {
  if (!expected.verificationAgentRunId) {
    throw new DataQualityVerificationBindingError(
      'DQ_VERIFICATION_AGENT_NOT_LINKED',
      'Data Quality remediation verification cannot be accepted before an authoritative verification agent run is linked.',
    )
  }

  if (candidate.agentRunId !== expected.verificationAgentRunId) {
    throw new DataQualityVerificationBindingError(
      'DQ_VERIFICATION_AGENT_MISMATCH',
      'Verification agent run does not match the remediation workflow evidence binding.',
    )
  }

  if (expected.verificationProfileRunId) {
    const profileRunId = text(candidate.input.profileRunId)
    if (profileRunId !== expected.verificationProfileRunId) {
      throw new DataQualityVerificationBindingError(
        'DQ_VERIFICATION_PROFILE_MISMATCH',
        'Verification run does not consume the profiling run linked to the remediation workflow.',
      )
    }
  }

  const generation = expected.verificationGeneration ?? 0
  if (generation <= 0) return

  const workflowInstanceId = text(candidate.input.workflowInstanceId)
  if (workflowInstanceId !== expected.workflowInstanceId) {
    throw new DataQualityVerificationBindingError(
      'DQ_VERIFICATION_WORKFLOW_MISMATCH',
      'Verification run is not bound to the expected remediation workflow.',
    )
  }

  const candidateGeneration = integer(candidate.input.verificationGeneration)
  if (candidateGeneration !== generation) {
    throw new DataQualityVerificationBindingError(
      'DQ_VERIFICATION_GENERATION_MISMATCH',
      'Verification run generation does not match the active remediation verification generation.',
    )
  }

  const trigger = text(candidate.input.trigger)
  if (trigger !== 'DATA_QUALITY_REMEDIATION_VERIFICATION') {
    throw new DataQualityVerificationBindingError(
      'DQ_VERIFICATION_TRIGGER_MISMATCH',
      'Verification run was not created by the governed Data Quality remediation verification flow.',
    )
  }
}
