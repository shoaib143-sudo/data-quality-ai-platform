import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const service = fs.readFileSync('lib/governance/maturity-service.ts', 'utf8')

test('assessment health is deterministic and separate from maturity scoring', () => {
  assert.match(service, /function buildAssessmentHealth/)
  assert.match(service, /scorecard\.completion \* 0\.30/)
  assert.match(service, /evidenceCoverage \* 0\.20/)
  assert.match(service, /systemVerificationCoverage \* 0\.15/)
  assert.match(service, /stakeholderDepth \* 0\.15/)
  assert.match(service, /assessmentConsensus \?\? 0/)
  assert.match(service, /evidenceFreshness \?\? 0/)
})

test('assessment health counts distinct answered capabilities and current evidence only', () => {
  assert.match(service, /answeredQuestionIds = new Set/)
  assert.match(service, /evidenceQuestions = new Set/)
  assert.match(service, /observationQuestions = new Set/)
  assert.match(service, /evidence\.filter\(item => activeAt\(item\.expires_at\)\)/)
  assert.match(service, /observations\.filter\(item => activeAt\(item\.expires_at\)\)/)
})

test('result confidence uses explicit conservative bands', () => {
  assert.match(service, /score >= 75 \? 'HIGH' : score >= 45 \? 'MEDIUM' : 'LOW'/)
})
