import assert from 'node:assert/strict'
import fs from 'node:fs'

const fixture = JSON.parse(fs.readFileSync('tests/fixtures/data-steward-e2e-fixture.json','utf8'))

assert.equal(fixture.schemaVersion, 1)
assert.equal(fixture.persona, 'data-steward')
assert.equal(fixture.roleKey, 'DATA_STEWARD')
assert.equal(fixture.organizationRole, 'MEMBER')

const project = fixture.authorizedProject
assert.ok(project)
assert.deepEqual(
  [...project.autonomyModes].sort(),
  ['OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS'].sort(),
)

assert.ok(project.datasets.length >= 1, 'fixture requires a representative dataset')
const version = project.datasets[0].versions[0]
assert.equal(version.profilingState, 'COMPLETED')
assert.equal(version.hasMetrics, true)
assert.equal(version.hasFindings, true)
assert.ok(version.qualityRules.length >= 1)

assert.ok(project.stewardshipAssignments.length >= 1)
assert.ok(project.glossaryTerms.some(term => term.status === 'DRAFT'))
assert.ok(project.classifications.some(item => item.status === 'SUGGESTED'))
assert.ok(project.issues.some(issue => issue.status === 'OPEN'))

assert.ok(fixture.unauthorizedProject)
assert.equal(fixture.unauthorizedProject.expectedAllowed, false)
assert.ok(fixture.unauthorizedProject.expectedCapabilities.includes('agent.execute'))

assert.equal(fixture.approver.separatePrincipal, true)
assert.equal(fixture.approver.mustNotEqualPersona, true)
assert.ok(fixture.approver.approvalCapabilities.includes('execution.approve'))

for (const capability of [
  'admin.manage','source.manage','schedule.manage','policy.approve',
  'quality.exception.approve','execution.approve','agent.admin',
]) assert.ok(fixture.requiredNegativeCapabilities.includes(capability), capability)

for (const journey of [
  'stewardship','data-quality','glossary','classification','issues',
  'guided-approval','governed-auto','goal-driven','cross-project-denial',
]) assert.ok(fixture.requiredJourneys.includes(journey), journey)

console.log('Data Steward E2E fixture contract verified.')
