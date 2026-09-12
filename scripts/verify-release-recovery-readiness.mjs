import fs from 'node:fs'

const recoveryContract = JSON.parse(fs.readFileSync('infra/recovery/full-platform-recovery-contract.json', 'utf8'))
const evaluator = fs.readFileSync('lib/recovery/recovery-readiness.ts', 'utf8')
const drill = fs.readFileSync('scripts/recovery-drill.mjs', 'utf8')

const fail = (message) => { throw new Error(message) }

for (const scope of ['STORAGE','IDENTITY_CONFIG','APPLICATION_CONFIG','EDGE_RUNTIME','DEPENDENCIES','SERVICE_VALIDATION']) {
  if (!recoveryContract.requiredScopes?.[scope]) fail(`Canonical recovery contract is missing ${scope}.`)
  if (!evaluator.includes(`'${scope}'`)) fail(`Release recovery evaluator is missing ${scope}.`)
}
if (!evaluator.includes("'DATABASE'")) fail('Release recovery evaluator must include the independently rehearsed database scope.')
if (recoveryContract.timingTruth?.targetRpoMinutes !== 60) fail('Canonical RPO target drifted from 60 minutes.')
if (recoveryContract.timingTruth?.targetRtoMinutes !== 240) fail('Canonical RTO target drifted from 240 minutes.')
if (recoveryContract.timingTruth?.authoritativeRecoveryPointRequiredForRpo !== true) fail('RPO must remain bound to an authoritative recovery point.')
if (recoveryContract.timingTruth?.serviceReadyTimestampRequiredForRto !== true) fail('RTO must remain bound to service-ready time.')
if (recoveryContract.evidenceRules?.staticReconstructionEvidenceMayClaimReady !== false) fail('Static reconstruction evidence must not claim READY.')
if (!drill.includes('This result must not be interpreted as full-platform READY.')) fail('Database drill must retain its non-READY limitation.')

for (const marker of [
  'export const TARGET_RPO_MINUTES = 60',
  'export const TARGET_RTO_MINUTES = 240',
  'export const MAX_RELEASE_RECOVERY_EVIDENCE_AGE_HOURS = 24',
  'RPO_MEASUREMENT_INVALID',
  'RTO_MEASUREMENT_INVALID',
  'OBSERVED_AT_IN_FUTURE',
  'RECOVERY_EVIDENCE_STALE',
  "state: blockers.length === 0 ? 'PASS' : hardFailure ? 'FAIL' : 'NOT_MEASURED'",
  'AUTHORITATIVE_RECOVERY_POINT_MISSING',
  'SERVICE_READY_TIMESTAMP_MISSING'
]) {
  if (!evaluator.includes(marker)) fail(`Recovery evaluator must enforce ${marker}.`)
}
if (evaluator.includes('targetRpoMinutes: number') || evaluator.includes('targetRtoMinutes: number') || evaluator.includes('maxReleaseEvidenceAgeHours: number')) {
  fail('Recovery evidence callers must not supply policy RPO/RTO/freshness targets.')
}

console.log('Full-platform release recovery readiness contract verified with fixed 60m RPO / 240m RTO / 24h release-evidence freshness policy.')
