import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { evaluateCertificationEvidence } from '../lib/release-assurance/certification-evidence-evaluator.mjs'

const contract = JSON.parse(fs.readFileSync('infra/platform-assurance/post-implementation-certification-contract.json', 'utf8'))
const sourceCommit = 'abc123'
const now = new Date('2026-09-16T08:00:00.000Z')

function record(definition, overrides = {}) {
  return {
    evidenceClass: definition.id,
    result: 'PASS',
    sourceCommit,
    environment: definition.requiredFor.includes('PRODUCTION_VERIFIED') && !definition.requiredFor.includes('CERTIFIED') ? 'production' : 'ci',
    observedAt: '2026-09-16T07:55:00.000Z',
    producer: `producer-${definition.id}`,
    evidenceRef: `evidence://${definition.id}`,
    freshnessPolicy: { maxAgeSeconds: 3600 },
    ...overrides,
  }
}

function completeEvidence(claimLevel = 'CERTIFIED') {
  return contract.mandatoryEvidenceClasses
    .filter(definition => definition.requiredFor.includes(claimLevel))
    .map(definition => record(definition))
}

test('CERTIFIED passes only with one fresh exact-head record for every required class', () => {
  const result = evaluateCertificationEvidence({ contract, evidence: completeEvidence(), claimLevel: 'CERTIFIED', sourceCommit, now })
  assert.equal(result.eligible, true, result.failures.join('\n'))
})

test('missing required evidence class fails closed', () => {
  const evidence = completeEvidence().slice(1)
  const result = evaluateCertificationEvidence({ contract, evidence, claimLevel: 'CERTIFIED', sourceCommit, now })
  assert.equal(result.eligible, false)
  assert.match(result.failures.join('\n'), /Required evidence class .* is missing/)
})

test('duplicate authoritative records fail closed instead of selecting a convenient PASS', () => {
  const evidence = completeEvidence()
  evidence.push({ ...evidence[0] })
  const result = evaluateCertificationEvidence({ contract, evidence, claimLevel: 'CERTIFIED', sourceCommit, now })
  assert.equal(result.eligible, false)
  assert.match(result.failures.join('\n'), /exactly one authoritative record is required/)
})

test('NOT_MEASURED FAIL and WAIVED cannot satisfy a required evidence class', () => {
  for (const forbidden of ['NOT_MEASURED', 'FAIL', 'WAIVED']) {
    const evidence = completeEvidence()
    evidence[0] = { ...evidence[0], result: forbidden }
    const result = evaluateCertificationEvidence({ contract, evidence, claimLevel: 'CERTIFIED', sourceCommit, now })
    assert.equal(result.eligible, false, forbidden)
    assert.match(result.failures.join('\n'), new RegExp(`result ${forbidden} cannot satisfy CERTIFIED`))
  }
})

test('NOT_APPLICABLE requires an explicit rationale', () => {
  const evidence = completeEvidence()
  evidence[0] = { ...evidence[0], result: 'NOT_APPLICABLE' }
  const result = evaluateCertificationEvidence({ contract, evidence, claimLevel: 'CERTIFIED', sourceCommit, now })
  assert.equal(result.eligible, false)
  assert.match(result.failures.join('\n'), /NOT_APPLICABLE evidence requires an explicit rationale/)
  evidence[0] = { ...evidence[0], rationale: 'This control is genuinely outside the certified scope.' }
  assert.equal(evaluateCertificationEvidence({ contract, evidence, claimLevel: 'CERTIFIED', sourceCommit, now }).eligible, true)
})

test('stale future and wrong-commit evidence fail closed', () => {
  for (const mutation of [
    { observedAt: '2026-09-16T06:00:00.000Z' },
    { observedAt: '2026-09-16T09:00:00.000Z' },
    { sourceCommit: 'other-head' },
  ]) {
    const evidence = completeEvidence()
    evidence[0] = { ...evidence[0], ...mutation }
    const result = evaluateCertificationEvidence({ contract, evidence, claimLevel: 'CERTIFIED', sourceCommit, now })
    assert.equal(result.eligible, false)
  }
})

test('missing freshness policy or required provenance fields fails closed', () => {
  const mutations = [
    { freshnessPolicy: null },
    { producer: '' },
    { evidenceRef: '' },
    { environment: '' },
  ]
  for (const mutation of mutations) {
    const evidence = completeEvidence()
    evidence[0] = { ...evidence[0], ...mutation }
    const result = evaluateCertificationEvidence({ contract, evidence, claimLevel: 'CERTIFIED', sourceCommit, now })
    assert.equal(result.eligible, false)
  }
})

test('PRODUCTION_VERIFIED requires production-only classes in addition to certified classes', () => {
  const certifiedOnly = completeEvidence('CERTIFIED')
  const result = evaluateCertificationEvidence({ contract, evidence: certifiedOnly, claimLevel: 'PRODUCTION_VERIFIED', sourceCommit, now })
  assert.equal(result.eligible, false)
  assert.match(result.failures.join('\n'), /Required evidence class BUILD_PROVENANCE is missing/)
  const full = completeEvidence('PRODUCTION_VERIFIED')
  assert.equal(evaluateCertificationEvidence({ contract, evidence: full, claimLevel: 'PRODUCTION_VERIFIED', sourceCommit, now }).eligible, true)
})
