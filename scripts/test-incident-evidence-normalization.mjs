import assert from 'node:assert/strict'
import { normalizeRootCauseEvidence, resolveLegacyVerificationProfileRunId } from '../lib/governance/incident-evidence-normalization.ts'

assert.deepEqual(normalizeRootCauseEvidence([
  {
    cause: 'SOURCE_VALIDATION_OR_MAPPING_GAP',
    confidence: 0.8,
    evidence: { column: 'email', failures: 1 },
  },
]), [{
  explanation: 'SOURCE_VALIDATION_OR_MAPPING_GAP',
  confidence: 0.8,
  evidence: { column: 'email', failures: 1 },
}])

assert.deepEqual(normalizeRootCauseEvidence([
  'Plain cause',
  { summary: 'Summary cause', confidence: '0.6' },
  { description: 'Description cause' },
  { rationale: 'Rationale cause', confidence: 4 },
  { confidence: 0.9 },
]), [
  { explanation: 'Plain cause', confidence: null, evidence: {} },
  { explanation: 'Summary cause', confidence: 0.6, evidence: {} },
  { explanation: 'Description cause', confidence: null, evidence: {} },
  { explanation: 'Rationale cause', confidence: null, evidence: {} },
])

assert.deepEqual(normalizeRootCauseEvidence(null), [])
assert.equal(resolveLegacyVerificationProfileRunId('dedicated-profile', { verification_profile_run_id: 'legacy-profile' }), 'dedicated-profile')
assert.equal(resolveLegacyVerificationProfileRunId(null, { verification_profile_run_id: 'legacy-profile' }), 'legacy-profile')
assert.equal(resolveLegacyVerificationProfileRunId(null, {}), null)

console.log('Incident evidence normalization unit tests passed.')
