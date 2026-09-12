import assert from 'node:assert/strict'

const { validateLifecycleEvidence } = await import('../lib/privacy/data-lifecycle.ts')

const aiOutput = {
  dataClassId: 'AI_OUTPUT',
  purpose: 'governed model evidence',
  retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
  retentionPolicyRef: 'policy://ai-evidence-retention',
  accessPolicyRef: null,
  deletionMode: 'DELETE_WITH_AI_EVIDENCE_POLICY',
  governanceAuthority: 'ADVISORY_ONLY',
  containsSecretValue: false,
  containsRawSensitiveValue: false,
  sensitivity: 'MODEL_DERIVED',
}

{
  const result = validateLifecycleEvidence(aiOutput)
  assert.equal(result.valid, true)
  assert.deepEqual(result.blockers, [])
}

{
  const result = validateLifecycleEvidence({ ...aiOutput, dataClassId: 'UNREGISTERED_CLASS' })
  assert.equal(result.valid, false)
  assert(result.blockers.includes('DATA_CLASS_NOT_GOVERNED'))
}

{
  const result = validateLifecycleEvidence({ ...aiOutput, retentionMode: 'INDEFINITE' })
  assert.equal(result.valid, false)
  assert(result.blockers.includes('RETENTION_MODE_POLICY_MISMATCH'))
}

{
  const result = validateLifecycleEvidence({ ...aiOutput, deletionMode: 'NEVER_DELETE' })
  assert(result.blockers.includes('DELETION_MODE_POLICY_MISMATCH'))
}

{
  const result = validateLifecycleEvidence({ ...aiOutput, containsSecretValue: true })
  assert.equal(result.valid, false)
  assert(result.blockers.includes('SECRET_VALUE_PERSISTENCE_FORBIDDEN'))
}

{
  const result = validateLifecycleEvidence({ ...aiOutput, retentionPolicyRef: null })
  assert(result.blockers.includes('TIME_BOUND_RETENTION_POLICY_REFERENCE_REQUIRED'))
}

{
  const result = validateLifecycleEvidence({ ...aiOutput, governanceAuthority: 'AUTHORITATIVE' })
  assert(result.blockers.includes('GOVERNANCE_AUTHORITY_POLICY_MISMATCH'))
  assert(result.blockers.includes('AI_OUTPUT_CANNOT_BE_GOVERNANCE_AUTHORITY'))
}

{
  const result = validateLifecycleEvidence({ ...aiOutput, sensitivity: 'PUBLIC' })
  assert(result.blockers.includes('SENSITIVITY_POLICY_MISMATCH'))
}

{
  const result = validateLifecycleEvidence({ ...aiOutput, containsRawSensitiveValue: true })
  assert(result.blockers.includes('RAW_SENSITIVE_VALUE_PERSISTENCE_FORBIDDEN'))
}

{
  const result = validateLifecycleEvidence({
    dataClassId: 'SOURCE_SAMPLE',
    purpose: 'profiling evidence',
    retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
    retentionPolicyRef: 'policy://source-evidence-retention',
    accessPolicyRef: null,
    deletionMode: 'DELETE_WITH_SOURCE_EVIDENCE_POLICY',
    governanceAuthority: 'AUTHORITATIVE_CLASSIFICATION',
    containsSecretValue: false,
    containsRawSensitiveValue: true,
    sensitivity: 'SOURCE_DERIVED_POTENTIALLY_SENSITIVE',
  })
  assert(result.blockers.includes('RAW_SENSITIVE_VALUE_PERSISTENCE_FORBIDDEN'))
}

{
  const result = validateLifecycleEvidence({
    dataClassId: 'DOCUMENT_CONTENT',
    purpose: 'governance document retrieval',
    retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
    retentionPolicyRef: 'policy://document-retention',
    accessPolicyRef: null,
    deletionMode: 'CASCADE_SOURCE_AND_DERIVED_CONTENT',
    governanceAuthority: 'DOCUMENT_SOURCE_PROVENANCE',
    containsSecretValue: false,
    containsRawSensitiveValue: true,
    sensitivity: 'DOCUMENT_DERIVED',
  })
  assert(result.blockers.includes('RAW_SENSITIVE_SOURCE_ACCESS_POLICY_REQUIRED'))
}

{
  const result = validateLifecycleEvidence({
    dataClassId: 'DOCUMENT_CONTENT',
    purpose: 'governance document retrieval',
    retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
    retentionPolicyRef: 'policy://document-retention',
    accessPolicyRef: 'policy://document-sensitive-access',
    deletionMode: 'CASCADE_SOURCE_AND_DERIVED_CONTENT',
    governanceAuthority: 'DOCUMENT_SOURCE_PROVENANCE',
    containsSecretValue: false,
    containsRawSensitiveValue: true,
    sensitivity: 'DOCUMENT_DERIVED',
  })
  assert.equal(result.valid, true)
}

{
  const result = validateLifecycleEvidence({
    dataClassId: 'TELEMETRY_ATTRIBUTE',
    purpose: 'operational observability',
    retentionMode: 'TIME_BOUND_GOVERNED_POLICY',
    retentionPolicyRef: 'policy://telemetry-retention',
    accessPolicyRef: null,
    deletionMode: 'DELETE_WITH_OBSERVABILITY_POLICY',
    governanceAuthority: 'AUTHORITATIVE',
    containsSecretValue: false,
    containsRawSensitiveValue: false,
    sensitivity: 'OPERATIONAL_METADATA',
  })
  assert(result.blockers.includes('TELEMETRY_CANNOT_BE_GOVERNANCE_AUTHORITY'))
}

{
  const result = validateLifecycleEvidence({
    dataClassId: 'EMBEDDING',
    purpose: 'semantic retrieval',
    retentionMode: 'FOLLOW_SOURCE_LIFECYCLE',
    retentionPolicyRef: null,
    accessPolicyRef: null,
    deletionMode: 'CASCADE_WITH_SOURCE',
    governanceAuthority: 'AUTHORITATIVE',
    containsSecretValue: false,
    containsRawSensitiveValue: false,
    sensitivity: 'DERIVED_FROM_SOURCE_CONTENT',
  })
  assert(result.blockers.includes('EMBEDDING_CANNOT_BE_GOVERNANCE_AUTHORITY'))
}

{
  const result = validateLifecycleEvidence({
    dataClassId: 'CREDENTIAL_REFERENCE',
    purpose: 'credential reference resolution',
    retentionMode: 'FOLLOW_CONNECTION_LIFECYCLE',
    retentionPolicyRef: null,
    accessPolicyRef: null,
    deletionMode: 'DELETE_REFERENCE_WITH_CONNECTION',
    governanceAuthority: 'SECRET_VALUE',
    containsSecretValue: false,
    containsRawSensitiveValue: false,
    sensitivity: 'SECRET_METADATA',
  })
  assert(result.blockers.includes('CREDENTIAL_REFERENCE_CANNOT_BECOME_SECRET_AUTHORITY'))
}

console.log('Privacy data lifecycle negative/adversarial runtime tests passed.')
