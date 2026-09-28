import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const { validatePairedLearningBenchmark } = await import('../lib/agents/governed-learning-paired-benchmark.ts')

const cases = Array.from({ length: 20 }, (_, index) => ({
  caseKey: createHash('sha256').update(`heldout-${index}`).digest('hex'),
  baselineScore: 0.7,
  candidateScore: 0.8,
  baselineEvidenceRef: `00000000-0000-4000-8000-${String(index * 2 + 1).padStart(12, '0')}`,
  candidateEvidenceRef: `00000000-0000-4000-8000-${String(index * 2 + 2).padStart(12, '0')}`,
  authorityViolation: false,
  adversarialFailure: false,
}))
const benchmark = {
  caseCount: cases.length,
  baselineScore: 0.7,
  candidateScore: 0.8,
  authorityViolations: 0,
  adversarialFailures: 0,
  evidenceRefs: cases.flatMap((item) => [item.baselineEvidenceRef, item.candidateEvidenceRef]),
}
const validate = (rows = cases, aggregate = benchmark, trainingCaseKeys = []) =>
  validatePairedLearningBenchmark({ cases: rows, benchmark: aggregate, trainingCaseKeys })

assert.equal(validate().caseCount, 20)
assert.throws(() => validate(cases.slice(1)), /case count/)
assert.throws(() => validate([cases[0], cases[0], ...cases.slice(2)]), /unique/)
assert.throws(() => validate(cases, benchmark, [cases[0].caseKey]), /overlaps/)
assert.throws(() => validate([{ ...cases[0], caseKey: 'plain-text-case' }, ...cases.slice(1)]), /SHA-256/)
assert.throws(() => validate([{ ...cases[0], candidateScore: 0 }, ...cases.slice(1)]), /aggregate scores/)
assert.throws(() => validate([{ ...cases[0], authorityViolation: true }, ...cases.slice(1)]), /safety counts/)
assert.throws(() => validate(cases, { ...benchmark, evidenceRefs: benchmark.evidenceRefs.slice(1) }), /evidence references/)
assert.throws(() => validate([{ ...cases[0], baselineEvidenceRef: cases[0].candidateEvidenceRef }, ...cases.slice(1)]), /unique/)
assert.throws(() => validate([{ ...cases[0], candidateScore: Number.NaN }, ...cases.slice(1)]), /between 0 and 1/)

console.log('Paired held-out benchmark rejects mismatched, duplicated, leaked, and unsupported aggregate claims.')
