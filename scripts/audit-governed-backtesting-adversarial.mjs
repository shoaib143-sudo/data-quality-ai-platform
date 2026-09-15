import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const datasetSource = fs.readFileSync(path.join(root, 'lib/ai/evaluation-dataset.ts'), 'utf8')
const backtestSource = fs.readFileSync(path.join(root, 'lib/ai/governed-backtesting.ts'), 'utf8')
const testsSource = fs.readFileSync(path.join(root, 'scripts/test-governed-backtesting.mjs'), 'utf8')

for (const required of [
  'effective: boolean',
  "typeof learning.effective !== 'boolean'",
  'hasCompleteVerificationChecks',
  'if (value == null) return null',
  "key.toLowerCase() === 'synthetic_bootstrap'",
]) {
  assert.ok(datasetSource.includes(required), `Evaluation dataset adversarial boundary missing: ${required}`)
}

for (const required of [
  "GOVERNED_BACKTEST_VERSION = 'governed-backtest-v1'",
  "trainingCutoffAt must be before evaluationEndAt",
  "verifiedAt > trainingCutoff && verifiedAt <= evaluationEnd",
  "TRAINING_CLASS_COLLAPSE",
  "EVALUATION_CLASS_COLLAPSE",
  'predictiveProbabilityExposed: false',
  'shadowDecisionAuthority: false',
  'historicalOutcomeOnly: true',
]) {
  assert.ok(backtestSource.includes(required), `Governed backtest adversarial boundary missing: ${required}`)
}

assert.ok(!backtestSource.includes('Math.random'), 'Backtesting must not use random partitions that can leak temporal evidence.')
assert.ok(!backtestSource.includes('predict('), 'Backtesting readiness must not execute predictive inference.')
assert.ok(!backtestSource.includes('executeAction'), 'Shadow/backtest readiness must not acquire execution authority.')

for (const required of [
  'preserves both positive and negative outcomes',
  'missing numeric evaluation evidence fails closed',
  'incomplete verification evidence fails closed',
  'synthetic bootstrap learning cases remain excluded',
  'strict temporal holdout',
  'single-class history is not ready',
]) {
  assert.ok(testsSource.includes(required), `Adversarial test case missing: ${required}`)
}

console.log('Governed backtesting adversarial audit passed.')
