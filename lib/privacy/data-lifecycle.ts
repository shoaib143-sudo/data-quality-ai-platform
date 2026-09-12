export type LifecycleRetentionMode =
  | 'TIME_BOUND_GOVERNED_POLICY'
  | 'GOVERNED_RECORD'
  | 'FOLLOW_SOURCE_LIFECYCLE'
  | 'FOLLOW_CONNECTION_LIFECYCLE'

export type RawSensitiveHandling = 'FORBIDDEN' | 'GOVERNED_SOURCE_ONLY'

export const LIFECYCLE_POLICIES = {
  SOURCE_SAMPLE: {
    sensitivity: 'SOURCE_DERIVED_POTENTIALLY_SENSITIVE',
    retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
    deletionMode: 'DELETE_WITH_SOURCE_EVIDENCE_POLICY',
    governanceAuthority: 'AUTHORITATIVE_CLASSIFICATION',
    rawSensitiveHandling: 'FORBIDDEN',
  },
  PROFILE_METRIC_VALUE: {
    sensitivity: 'AGGREGATED_OR_DERIVED',
    retentionMode: 'GOVERNED_RECORD',
    deletionMode: 'DELETE_WITH_DATASET_LIFECYCLE',
    governanceAuthority: 'PROFILING_TRUTH',
    rawSensitiveHandling: 'FORBIDDEN',
  },
  QUALITY_EXCEPTION_SAMPLE: {
    sensitivity: 'SOURCE_DERIVED_POTENTIALLY_SENSITIVE',
    retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
    deletionMode: 'DELETE_WITH_QUALITY_EVIDENCE_POLICY',
    governanceAuthority: 'DQ_EVIDENCE',
    rawSensitiveHandling: 'FORBIDDEN',
  },
  DOCUMENT_CONTENT: {
    sensitivity: 'DOCUMENT_DERIVED',
    retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
    deletionMode: 'CASCADE_SOURCE_AND_DERIVED_CONTENT',
    governanceAuthority: 'DOCUMENT_SOURCE_PROVENANCE',
    rawSensitiveHandling: 'GOVERNED_SOURCE_ONLY',
  },
  EMBEDDING: {
    sensitivity: 'DERIVED_FROM_SOURCE_CONTENT',
    retentionMode: 'FOLLOW_SOURCE_LIFECYCLE',
    deletionMode: 'CASCADE_WITH_SOURCE',
    governanceAuthority: 'RETRIEVAL_INDEX_ONLY',
    rawSensitiveHandling: 'FORBIDDEN',
  },
  AI_PROMPT: {
    sensitivity: 'CONTEXT_DERIVED_POTENTIALLY_SENSITIVE',
    retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
    deletionMode: 'DELETE_WITH_AI_EVIDENCE_POLICY',
    governanceAuthority: 'NON_AUTHORITATIVE_INPUT',
    rawSensitiveHandling: 'FORBIDDEN',
  },
  AI_OUTPUT: {
    sensitivity: 'MODEL_DERIVED',
    retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
    deletionMode: 'DELETE_WITH_AI_EVIDENCE_POLICY',
    governanceAuthority: 'ADVISORY_ONLY',
    rawSensitiveHandling: 'FORBIDDEN',
  },
  TELEMETRY_ATTRIBUTE: {
    sensitivity: 'OPERATIONAL_METADATA',
    retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
    deletionMode: 'DELETE_WITH_OBSERVABILITY_POLICY',
    governanceAuthority: 'OBSERVABILITY_ONLY',
    rawSensitiveHandling: 'FORBIDDEN',
  },
  AUDIT_EVIDENCE: {
    sensitivity: 'GOVERNANCE_METADATA',
    retentionMode: 'GOVERNED_RECORD',
    deletionMode: 'GOVERNED_ERASURE_OR_ARCHIVE_ONLY',
    governanceAuthority: 'AUDIT_AUTHORITY',
    rawSensitiveHandling: 'FORBIDDEN',
  },
  CREDENTIAL_REFERENCE: {
    sensitivity: 'SECRET_METADATA',
    retentionMode: 'FOLLOW_CONNECTION_LIFECYCLE',
    deletionMode: 'DELETE_REFERENCE_WITH_CONNECTION',
    governanceAuthority: 'REFERENCE_ONLY',
    rawSensitiveHandling: 'FORBIDDEN',
  },
} as const

export type LifecycleDataClass = keyof typeof LIFECYCLE_POLICIES

export type LifecycleEvidenceInput = {
  dataClassId: string
  purpose: string
  retentionMode: string
  retentionPolicyRef?: string | null
  accessPolicyRef?: string | null
  deletionMode: string
  governanceAuthority: string
  containsSecretValue: boolean
  containsRawSensitiveValue: boolean
  sensitivity: string
}

export type LifecycleEvidenceResult = {
  valid: boolean
  blockers: string[]
}

export function validateLifecycleEvidence(input: LifecycleEvidenceInput): LifecycleEvidenceResult {
  const blockers: string[] = []

  if (!input.dataClassId.trim()) blockers.push('DATA_CLASS_ID_MISSING')
  if (!input.purpose.trim()) blockers.push('PURPOSE_MISSING')
  if (!input.deletionMode.trim()) blockers.push('DELETION_MODE_MISSING')
  if (!input.governanceAuthority.trim()) blockers.push('GOVERNANCE_AUTHORITY_MISSING')
  if (!input.sensitivity.trim()) blockers.push('SENSITIVITY_MISSING')
  if (input.containsSecretValue) blockers.push('SECRET_VALUE_PERSISTENCE_FORBIDDEN')

  const policy = LIFECYCLE_POLICIES[input.dataClassId as LifecycleDataClass]
  if (!policy) {
    blockers.push('DATA_CLASS_NOT_GOVERNED')
    return { valid: false, blockers }
  }

  if (input.sensitivity !== policy.sensitivity) blockers.push('SENSITIVITY_POLICY_MISMATCH')
  if (input.retentionMode !== policy.retentionMode) blockers.push('RETENTION_MODE_POLICY_MISMATCH')
  if (input.deletionMode !== policy.deletionMode) blockers.push('DELETION_MODE_POLICY_MISMATCH')
  if (input.governanceAuthority !== policy.governanceAuthority) blockers.push('GOVERNANCE_AUTHORITY_POLICY_MISMATCH')

  if (policy.retentionMode === 'TIME_BOUND_GOVERNED_POLICY' && !input.retentionPolicyRef?.trim()) {
    blockers.push('TIME_BOUND_RETENTION_POLICY_REFERENCE_REQUIRED')
  }

  if (input.containsRawSensitiveValue) {
    if (policy.rawSensitiveHandling === 'FORBIDDEN') {
      blockers.push('RAW_SENSITIVE_VALUE_PERSISTENCE_FORBIDDEN')
    } else if (policy.rawSensitiveHandling === 'GOVERNED_SOURCE_ONLY' && !input.accessPolicyRef?.trim()) {
      blockers.push('RAW_SENSITIVE_SOURCE_ACCESS_POLICY_REQUIRED')
    }
  }

  if (input.dataClassId === 'AI_OUTPUT' && input.governanceAuthority !== 'ADVISORY_ONLY') {
    blockers.push('AI_OUTPUT_CANNOT_BE_GOVERNANCE_AUTHORITY')
  }
  if (input.dataClassId === 'EMBEDDING' && input.governanceAuthority !== 'RETRIEVAL_INDEX_ONLY') {
    blockers.push('EMBEDDING_CANNOT_BE_GOVERNANCE_AUTHORITY')
  }
  if (input.dataClassId === 'TELEMETRY_ATTRIBUTE' && input.governanceAuthority !== 'OBSERVABILITY_ONLY') {
    blockers.push('TELEMETRY_CANNOT_BE_GOVERNANCE_AUTHORITY')
  }
  if (input.dataClassId === 'CREDENTIAL_REFERENCE' && input.governanceAuthority !== 'REFERENCE_ONLY') {
    blockers.push('CREDENTIAL_REFERENCE_CANNOT_BECOME_SECRET_AUTHORITY')
  }

  return { valid: blockers.length === 0, blockers }
}
