import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'

const framework = fs.readFileSync('lib/governance/maturity-framework.ts', 'utf8')
const scoring = fs.readFileSync('lib/governance/maturity-scoring.ts', 'utf8')

test('framework is versioned and uses six behavioral levels', () => {
  assert.match(framework, /DN-GMA-1\.0/)
  for (const label of ['Absent', 'Ad hoc', 'Developing', 'Defined', 'Managed', 'Adaptive']) {
    assert.match(framework, new RegExp(label))
  }
})

test('framework covers the six primary onboarding domains and critical governance capabilities', () => {
  for (const domain of ['purpose', 'principles', 'people', 'practices', 'ai', 'capacity']) {
    assert.match(framework, new RegExp("id: '" + domain + "'"))
  }
  for (const capability of ['PRACTICES-QUALITY', 'PRACTICES-LINEAGE', 'PRACTICES-SECURITY', 'PEOPLE-STEWARDSHIP', 'AI-FRAMEWORK']) {
    assert.match(framework, new RegExp(capability))
  }
})

test('scoring remains explainable and separates maturity from evidence, coverage, consensus, and risk', () => {
  for (const field of ['maturity', 'targetMaturity', 'evidenceConfidence', 'controlCoverage', 'assessmentConsensus', 'riskExposure', 'criticalGaps']) {
    assert.match(scoring, new RegExp(field))
  }
  assert.match(scoring, /weightedContribution/)
  assert.match(scoring, /questionApplies/)
})

test('critical gaps cannot disappear inside an aggregate score', () => {
  assert.match(scoring, /question\.criticality !== 'CRITICAL'/)
  assert.match(scoring, /score\.gap < 1/)
  assert.match(scoring, /score\.maturity >= 3/)
})
