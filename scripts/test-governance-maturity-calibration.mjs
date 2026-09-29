import assert from 'node:assert/strict'
import { questionsForProfile } from '../lib/governance/maturity-framework.ts'
import { scoreGovernanceMaturity } from '../lib/governance/maturity-scoring.ts'

function answers(profile, maturityFor, evidenceFor = () => 50, coverageFor = () => 50, respondentIds = ['primary']) {
  return questionsForProfile(profile).flatMap(question => respondentIds.map(respondentId => ({
    questionId: question.id,
    respondentId,
    maturity: maturityFor(question, respondentId),
    target: question.defaultTarget,
    priority: question.criticality === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
    evidenceConfidence: evidenceFor(question, respondentId),
    coverage: coverageFor(question, respondentId),
  })))
}

const base = {
  organizationType: 'PRIVATE',
  regulated: false,
  processesPersonalData: true,
  processesSensitiveData: false,
  usesAi: false,
  sharesDataExternally: false,
  crossBorderTransfers: false,
}

const startup = scoreGovernanceMaturity(base, answers(base, () => 1, () => 20, () => 15))
assert.ok(startup.maturity <= 25)
assert.ok(startup.criticalGaps.length > 0)

const regulated = { ...base, regulated: true, processesSensitiveData: true, sharesDataExternally: true, crossBorderTransfers: true }
const matureEnterprise = scoreGovernanceMaturity(
  regulated,
  answers(regulated, () => 4, () => 90, () => 90, ['executive', 'steward', 'security']),
)
assert.ok(matureEnterprise.maturity >= 75)
assert.ok((matureEnterprise.evidenceConfidence ?? 0) >= 85)
assert.ok((matureEnterprise.controlCoverage ?? 0) >= 85)
assert.equal(matureEnterprise.criticalGaps.length, 0)

const paperMature = scoreGovernanceMaturity(regulated, answers(regulated, () => 4, () => 75, () => 20))
assert.ok(paperMature.maturity >= 75)
assert.ok((paperMature.controlCoverage ?? 100) <= 25)
assert.ok((paperMature.evidenceConfidence ?? 0) >= 70)

const technicallyMature = scoreGovernanceMaturity(regulated, answers(regulated, () => 3, () => 20, () => 90))
assert.ok((technicallyMature.controlCoverage ?? 0) >= 85)
assert.ok((technicallyMature.evidenceConfidence ?? 100) <= 25)
assert.ok(technicallyMature.maturity < paperMature.maturity)

const aiHeavy = { ...regulated, usesAi: true }
const aiWeak = scoreGovernanceMaturity(
  aiHeavy,
  answers(aiHeavy, question => question.domainId === 'ai' ? 1 : 3.5, () => 55, () => 60),
)
assert.ok(aiWeak.questions.some(question => question.questionId === 'AI-FRAMEWORK'))
assert.ok(aiWeak.criticalGaps.some(gap => gap.questionId === 'AI-FRAMEWORK'))

const fragmented = scoreGovernanceMaturity(
  regulated,
  answers(
    regulated,
    (question, respondentId) => {
      const baseLevel = question.domainId === 'practices' ? 2 : 4
      if (respondentId === 'executive') return Math.min(5, baseLevel + 1)
      if (respondentId === 'practitioner') return Math.max(0, baseLevel - 1)
      return baseLevel
    },
    () => 55,
    question => question.domainId === 'practices' ? 35 : 70,
    ['executive', 'practitioner', 'risk'],
  ),
)
assert.ok((fragmented.assessmentConsensus ?? 100) < 90)
assert.ok(fragmented.domains.some(domain => domain.id === 'practices' && (domain.maturity ?? 100) < 60))

console.log('PASS governance maturity six-archetype calibration')
