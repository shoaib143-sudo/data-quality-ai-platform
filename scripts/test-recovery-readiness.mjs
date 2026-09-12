import assert from 'node:assert/strict'

const {
  evaluateRecoveryReadiness,
  REQUIRED_RECOVERY_SCOPES,
  TARGET_RPO_MINUTES,
  TARGET_RTO_MINUTES,
  MAX_RELEASE_RECOVERY_EVIDENCE_AGE_HOURS,
} = await import('../lib/recovery/recovery-readiness.ts')
const SHA = 'a'.repeat(40)

const allScopes = () => Object.fromEntries(REQUIRED_RECOVERY_SCOPES.map((scope) => [scope, { state: 'PASS', evidenceRef: `evidence://${scope}` }]))

function validInput() {
  return {
    sourceCommitSha: SHA,
    rehearsalId: 'rehearsal-1',
    observedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    scopes: allScopes(),
    timing: {
      authoritativeRecoveryPoint: true,
      serviceReadyTimestamp: true,
      measuredRpoMinutes: 30,
      measuredRtoMinutes: 120,
    },
  }
}

{
  const result = evaluateRecoveryReadiness(validInput())
  assert.equal(result.state, 'PASS')
  assert.deepEqual(result.blockers, [])
  assert.equal(result.policy.targetRpoMinutes, 60)
  assert.equal(result.policy.targetRtoMinutes, 240)
  assert.equal(result.policy.maxReleaseEvidenceAgeHours, 24)
  assert.equal(TARGET_RPO_MINUTES, 60)
  assert.equal(TARGET_RTO_MINUTES, 240)
  assert.equal(MAX_RELEASE_RECOVERY_EVIDENCE_AGE_HOURS, 24)
}

{
  const input = validInput()
  input.scopes = { DATABASE: input.scopes.DATABASE }
  const result = evaluateRecoveryReadiness(input)
  assert.equal(result.state, 'NOT_MEASURED')
  assert(result.blockers.includes('SCOPE_STORAGE_MISSING'))
  assert(result.blockers.includes('SCOPE_SERVICE_VALIDATION_MISSING'))
}

{
  const input = validInput()
  input.timing.measuredRpoMinutes = null
  input.timing.measuredRtoMinutes = null
  const result = evaluateRecoveryReadiness(input)
  assert.equal(result.state, 'NOT_MEASURED')
  assert(result.blockers.includes('RPO_NOT_MEASURED'))
  assert(result.blockers.includes('RTO_NOT_MEASURED'))
}

{
  const input = validInput()
  input.scopes.DEPENDENCIES.state = 'UNAVAILABLE'
  const result = evaluateRecoveryReadiness(input)
  assert.equal(result.state, 'NOT_MEASURED')
  assert(result.blockers.includes('SCOPE_DEPENDENCIES_UNAVAILABLE'))
}

{
  const input = validInput()
  input.scopes.STORAGE.state = 'FAIL'
  const result = evaluateRecoveryReadiness(input)
  assert.equal(result.state, 'FAIL')
  assert(result.blockers.includes('SCOPE_STORAGE_FAILED'))
}

{
  const input = validInput()
  input.timing.measuredRpoMinutes = 61
  const result = evaluateRecoveryReadiness(input)
  assert.equal(result.state, 'FAIL')
  assert(result.blockers.includes('RPO_TARGET_MISSED'))
}

{
  const input = validInput()
  input.timing.measuredRtoMinutes = 241
  const result = evaluateRecoveryReadiness(input)
  assert.equal(result.state, 'FAIL')
  assert(result.blockers.includes('RTO_TARGET_MISSED'))
}

{
  const input = validInput()
  input.timing.measuredRpoMinutes = -1
  input.timing.measuredRtoMinutes = Number.NaN
  const result = evaluateRecoveryReadiness(input)
  assert.equal(result.state, 'NOT_MEASURED')
  assert(result.blockers.includes('RPO_MEASUREMENT_INVALID'))
  assert(result.blockers.includes('RTO_MEASUREMENT_INVALID'))
}

{
  const input = validInput()
  input.timing.authoritativeRecoveryPoint = false
  const result = evaluateRecoveryReadiness(input)
  assert.equal(result.state, 'NOT_MEASURED')
  assert(result.blockers.includes('AUTHORITATIVE_RECOVERY_POINT_MISSING'))
}

{
  const input = validInput()
  input.observedAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const result = evaluateRecoveryReadiness(input)
  assert.equal(result.state, 'NOT_MEASURED')
  assert(result.blockers.includes('OBSERVED_AT_IN_FUTURE'))
}

{
  const input = validInput()
  input.observedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
  const result = evaluateRecoveryReadiness(input)
  assert.equal(result.state, 'NOT_MEASURED')
  assert(result.blockers.includes('RECOVERY_EVIDENCE_STALE'))
}

console.log('Recovery readiness negative/failure/adversarial tests passed.')
