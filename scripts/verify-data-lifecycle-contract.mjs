import fs from 'node:fs'

const contract = JSON.parse(fs.readFileSync('infra/privacy/data-lifecycle-contract.json', 'utf8'))
const evaluator = fs.readFileSync('lib/privacy/data-lifecycle.ts', 'utf8')
const sensitiveEvidenceMigration = fs.readFileSync('supabase/migrations/20260910184500_dq_result_truth_and_sensitive_evidence.sql', 'utf8')

const fail = (message) => { throw new Error(message) }

if (contract.schemaVersion !== 2) fail('Privacy lifecycle contract must remain versioned at schemaVersion 2.')
if (contract.secretValuesAllowed !== false) fail('Privacy lifecycle inventory must forbid secret values.')
if (contract.silentIndefiniteRetentionAllowed !== false) fail('Silent indefinite retention must remain forbidden.')

const requiredClasses = [
  'SOURCE_SAMPLE','PROFILE_METRIC_VALUE','QUALITY_EXCEPTION_SAMPLE','DOCUMENT_CONTENT','EMBEDDING',
  'AI_PROMPT','AI_OUTPUT','TELEMETRY_ATTRIBUTE','AUDIT_EVIDENCE','CREDENTIAL_REFERENCE'
]
const classes = new Map((contract.dataClasses ?? []).map((item) => [item.id, item]))
for (const id of requiredClasses) {
  const item = classes.get(id)
  if (!item) fail(`Privacy lifecycle contract is missing ${id}.`)
  for (const field of ['purpose','sensitivity','minimization','retentionMode','deletionMode','governanceAuthority','rawSensitiveHandling']) {
    if (!item[field]) fail(`${id} is missing ${field}.`)
  }
  if (String(item.retentionMode).includes('INDEFINITE')) fail(`${id} must not silently retain data indefinitely.`)
  if (!evaluator.includes(`${id}: {`)) fail(`Runtime lifecycle policy is missing ${id}.`)
  if (!evaluator.includes(`sensitivity: '${item.sensitivity}'`)) fail(`Runtime lifecycle sensitivity mapping is missing ${id}.`)
  if (!evaluator.includes(`retentionMode: '${item.retentionMode}'`)) fail(`Runtime lifecycle retention mapping is missing ${id}.`)
  if (!evaluator.includes(`deletionMode: '${item.deletionMode}'`)) fail(`Runtime lifecycle deletion mapping is missing ${id}.`)
  if (!evaluator.includes(`governanceAuthority: '${item.governanceAuthority}'`)) fail(`Runtime lifecycle authority mapping is missing ${id}.`)
  if (!evaluator.includes(`rawSensitiveHandling: '${item.rawSensitiveHandling}'`)) fail(`Runtime raw-sensitive mapping is missing ${id}.`)
}

for (const id of requiredClasses.filter((id) => id !== 'DOCUMENT_CONTENT')) {
  if (classes.get(id)?.rawSensitiveHandling !== 'FORBIDDEN') fail(`${id} must reject raw sensitive persisted values.`)
}
if (classes.get('DOCUMENT_CONTENT')?.rawSensitiveHandling !== 'GOVERNED_SOURCE_ONLY') fail('Raw sensitive document source content must require governed access policy.')
if (classes.get('AI_OUTPUT')?.governanceAuthority !== 'ADVISORY_ONLY') fail('AI output must remain advisory only.')
if (classes.get('EMBEDDING')?.governanceAuthority !== 'RETRIEVAL_INDEX_ONLY') fail('Embeddings must remain retrieval-only authority.')
if (classes.get('TELEMETRY_ATTRIBUTE')?.governanceAuthority !== 'OBSERVABILITY_ONLY') fail('Telemetry must remain observability-only authority.')
if (classes.get('CREDENTIAL_REFERENCE')?.minimization !== 'REFERENCE_NAME_ONLY') fail('Credential inventory must remain reference-only.')

for (const marker of ['quality_exception_sensitive_evidence','quarantine_sensitive_evidence','[REDACTED]','sha256:']) {
  if (!sensitiveEvidenceMigration.includes(marker)) fail(`Sensitive DQ evidence protection missing: ${marker}`)
}
for (const marker of [
  'DATA_CLASS_NOT_GOVERNED',
  'SENSITIVITY_POLICY_MISMATCH',
  'RETENTION_MODE_POLICY_MISMATCH',
  'DELETION_MODE_POLICY_MISMATCH',
  'GOVERNANCE_AUTHORITY_POLICY_MISMATCH',
  'SECRET_VALUE_PERSISTENCE_FORBIDDEN',
  'RAW_SENSITIVE_VALUE_PERSISTENCE_FORBIDDEN',
  'RAW_SENSITIVE_SOURCE_ACCESS_POLICY_REQUIRED',
  'AI_OUTPUT_CANNOT_BE_GOVERNANCE_AUTHORITY',
  'TELEMETRY_CANNOT_BE_GOVERNANCE_AUTHORITY'
]) {
  if (!evaluator.includes(marker)) fail(`Privacy lifecycle evaluator missing fail-closed marker ${marker}.`)
}

console.log(`Privacy data lifecycle contract verified: ${classes.size} governed data classes with runtime sensitivity/retention/authority allowlists.`)
