import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const service = fs.readFileSync('lib/governance/maturity-service.ts', 'utf8')
const route = fs.readFileSync('app/api/governance/maturity/route.ts', 'utf8')
const evidenceRoute = fs.readFileSync('app/api/governance/maturity/evidence/route.ts', 'utf8')

test('maturity API is authenticated and organization scoped', () => {
  assert.match(route, /requireApiUser/)
  assert.match(service, /resolveInstanceOrganizationMembership/)
  assert.match(service, /assessment\.organization_id !== membership\.organizationId/)
})

test('only organization administrators can configure organizational profile and target state', () => {
  assert.match(service, /Organization administrator access is required to configure the maturity assessment/)
  assert.match(service, /canSetTarget = isAdministrator/)
})

test('multi respondent responses are upserted without deleting other respondents', () => {
  assert.match(service, /respondent_user_id: userId/)
  assert.match(service, /assessment_id,question_id,respondent_user_id/)
  assert.doesNotMatch(service, /maturity_assessment_responses'\)\.delete/)
})

test('evidence is stored independently, contributes confidence by verification state, and audit events are emitted', () => {
  assert.match(service, /evidenceConfidenceByState/)
  assert.match(service, /CONTINUOUSLY_VERIFIED: 100/)
  assert.match(service, /enrichAssessmentAnswers/)
  assert.match(evidenceRoute, /addMaturityEvidence/)
  assert.match(evidenceRoute, /GOVERNANCE_MATURITY_EVIDENCE_ADDED/)
  assert.match(route, /GOVERNANCE_MATURITY_RESPONSES_UPDATED/)
})
