import assert from 'node:assert/strict'
import { personaSlugs, personas } from '../lib/governance/personas.ts'
import { personaAcceptanceTasks } from '../lib/governance/persona-acceptance-tasks.ts'
import { personaPresentationPolicies } from '../lib/governance/persona-presentation.ts'
import { buildRoleLandingPresentation } from '../lib/governance/persona-presentation-view.ts'

const sample = {
  confidence: .82,
  governedAssets: 12,
  activeSources: 4,
  materialFindings: 3,
  highFindings: 2,
  failedControls: 1,
  openAlerts: 2,
  coverage: 75,
  affectedDomains: 5,
  certifiedDatasets: 6,
  pendingCertifications: 2,
  pendingWaivers: 1,
  unresolvedIssues: 4,
  ownershipCoverage: 80,
  domainAssignedCoverage: 90,
  approvedGlossaryMappings: 10,
  approvedClassifications: 8,
  cdeMappings: 5,
  failedControlEvaluations: 1,
  datasets: [{ approvedClassifications: 1 }],
  businessImpact: [{ count: 3 }],
}

const concepts = {
  'senior-leadership': ['material risk', 'business impact', 'executive', 'trust'],
  'business-user': ['certified', 'known issues', 'trusted', 'safe-use'],
  'data-owner': ['owner', 'decision', 'Data Domain', 'risk'],
  'data-product-owner': ['product', 'consumer', 'certified', 'trust'],
  'data-steward': ['stewardship', 'investigation', 'metadata', 'issue'],
  'data-governance-specialist': ['governance', 'control', 'stewardship', 'programme'],
  'compliance-risk-officer': ['control', 'exception', 'assurance', 'regulatory'],
  'privacy-security-officer': ['classification', 'privacy', 'sensitive', 'downstream'],
  'data-governance-admin': ['platform', 'source', 'operational', 'profiling'],
  'data-custodian': ['technical', 'source', 'profiling', 'remediation'],
  'source-system-owner': ['source', 'downstream', 'upstream', 'defect'],
  'metadata-analyst': ['metadata', 'glossary', 'classification', 'Data Domain'],
  'data-quality-analyst': ['quality', 'finding', 'control', 'profiling'],
}

assert.equal(personaSlugs.length, 13)
for (const slug of personaSlugs) {
  const persona = personas[slug]
  const view = buildRoleLandingPresentation(personaPresentationPolicies[slug], sample)
  const corpus = [
    persona.strapline,
    persona.focus,
    persona.primaryQuestion,
    view.heroTitle,
    view.heroDetail,
    view.trendTitle,
    view.attentionTitle,
    view.contextTitle,
    view.actionKicker,
    view.actionTitle,
    ...view.metrics.flatMap(item => [item.label, item.detail]),
    ...view.aiStarters,
  ].join(' ').toLowerCase()

  for (const concept of concepts[slug]) {
    assert.ok(corpus.includes(concept.toLowerCase()), `${slug} landing is missing canonical concept: ${concept}`)
  }
  assert.ok(view.heroTitle.length > 12, `${slug} needs persona-specific hero content`)
  assert.ok(view.heroDetail.length > 24, `${slug} needs persona-specific hero explanation`)
  assert.ok(view.trendTitle.length > 8, `${slug} needs persona-specific trend framing`)
  assert.ok(view.metrics.length === 4, `${slug} needs four focused landing metrics`)
  assert.ok(view.aiStarters.length >= 4, `${slug} needs contextual AI starters`)
  assert.ok(personaAcceptanceTasks[slug].length >= 4, `${slug} needs real-life acceptance tasks`)
}

const exec = buildRoleLandingPresentation(personaPresentationPolicies['senior-leadership'], sample)
const executiveText = [exec.heroTitle, exec.heroDetail, exec.trendTitle, ...exec.metrics.flatMap(item => [item.label, item.detail])].join(' ').toLowerCase()
for (const forbidden of ['profile run id', 'execution engine', 'dataset version id']) {
  assert.ok(!executiveText.includes(forbidden), `Senior Leadership must suppress technical detail: ${forbidden}`)
}

const dq = buildRoleLandingPresentation(personaPresentationPolicies['data-quality-analyst'], sample)
assert.ok(dq.trendTitle.toLowerCase().includes('quality'), 'Data Quality Analyst trend must remain quality-focused')
assert.ok(dq.heroDetail.toLowerCase().includes('failed quality controls'), 'Data Quality Analyst hero must retain diagnostic detail')

console.log('PASS persona landing content parity: 13/13 persona compositions preserve canonical intent')
