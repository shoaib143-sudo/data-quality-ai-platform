import assert from 'node:assert/strict'
import {
  GOVERNANCE_MATURITY_QUESTIONS,
  questionsForProfile,
} from '../lib/governance/maturity-framework.ts'
import { scoreGovernanceMaturity } from '../lib/governance/maturity-scoring.ts'

const profile = {
  organizationType: 'PRIVATE',
  regulated: true,
  processesPersonalData: true,
  processesSensitiveData: true,
  usesAi: false,
  sharesDataExternally: false,
  crossBorderTransfers: false,
}

const applicable = questionsForProfile(profile)
assert.ok(applicable.length >= 10, 'baseline should retain a meaningful set of applicable questions')
assert.equal(applicable.some(question => question.id === 'AI-FRAMEWORK'), false, 'AI questions must be excluded when AI is not in use')
assert.equal(applicable.some(question => question.id === 'PRACTICES-PRIVACY'), true, 'privacy must apply when personal data is processed')

const highMaturityAnswers = applicable.flatMap(question => [
  {
    questionId: question.id,
    respondentId: 'executive',
    maturity: question.id === 'PRACTICES-SECURITY' ? 1 : 5,
    target: 4,
    priority: question.id === 'PRACTICES-SECURITY' ? 'HIGH' : 'MEDIUM',
    evidenceConfidence: 70,
    coverage: 80,
  },
])

const highMaturity = scoreGovernanceMaturity(profile, highMaturityAnswers)
assert.ok(highMaturity.maturity > 80, 'strong capabilities should produce a high aggregate score')
assert.ok(
  highMaturity.criticalGaps.some(gap => gap.questionId === 'PRACTICES-SECURITY'),
  'a critical security weakness must remain visible even when aggregate maturity is high',
)
assert.ok(
  highMaturity.roadmap.some(item => item.questionId === 'PRACTICES-SECURITY'),
  'material target gaps must enter the improvement roadmap',
)

const consensus = scoreGovernanceMaturity(profile, [
  { questionId: 'PEOPLE-STEWARDSHIP', respondentId: 'executive', maturity: 4, target: 4, priority: 'HIGH' },
  { questionId: 'PEOPLE-STEWARDSHIP', respondentId: 'steward', maturity: 2, target: null, priority: 'HIGH' },
])
const stewardship = consensus.questions.find(item => item.questionId === 'PEOPLE-STEWARDSHIP')
assert.equal(stewardship?.maturity, 3)
assert.equal(stewardship?.consensus, 60)
assert.equal(consensus.respondentCount, 2)

assert.ok(GOVERNANCE_MATURITY_QUESTIONS.every(question => question.provenance.source.length > 0), 'every question must retain provenance')
console.log('PASS governance maturity scoring tests')

const partialCritical = scoreGovernanceMaturity(profile, [
  { questionId: 'PRACTICES-SECURITY', respondentId: 'security', maturity: 0, target: 5, priority: 'HIGH' },
])
assert.equal(partialCritical.riskExposure, 'CRITICAL', 'unanswered questions must not dilute assessed risk')
assert.ok(partialCritical.completion < 20, 'completion remains separate from assessed risk')
console.log('PASS governance maturity partial-risk denominator')
