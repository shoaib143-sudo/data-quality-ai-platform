import assert from 'node:assert/strict'
import test from 'node:test'

import { buildExecutiveSlides, renderGovernanceReportPdf, renderGovernanceReportPptx } from '../lib/orchestration/governance-report-export.ts'
import { buildExecutiveNarrationScript } from '../lib/orchestration/governance-report-narration.ts'

const report = {
  schemaVersion: '1.0',
  reportId: 'report-1',
  reportHashInput: '{}',
  projectId: 'project-1',
  orchestratorRunId: 'run-1',
  capabilityRunId: 'cap-run-1',
  generatedAt: '2026-09-16T00:00:00.000Z',
  persona: 'EXECUTIVE',
  depth: 'EXECUTIVE',
  title: 'DataNexus Governance Outcome Report',
  openingSummary: 'Executive outcome: evidence-backed report.',
  scores: {
    governanceHealth: { key: 'governanceHealth', label: 'Governance Health', status: 'NOT_MEASURED', value: null, evidenceRefs: [], method: 'NOT_MEASURED' },
    businessImpact: { key: 'businessImpact', label: 'Business Impact', status: 'NOT_MEASURED', value: null, evidenceRefs: [], method: 'NOT_MEASURED' },
    riskReduction: { key: 'riskReduction', label: 'Risk Reduction', status: 'NOT_MEASURED', value: null, evidenceRefs: [], method: 'NOT_MEASURED' },
    compliancePosture: { key: 'compliancePosture', label: 'Compliance Posture', status: 'NOT_MEASURED', value: null, evidenceRefs: [], method: 'NOT_MEASURED' },
    dataQualityImprovement: { key: 'dataQualityImprovement', label: 'Data Quality Improvement', status: 'NOT_MEASURED', value: null, evidenceRefs: [], method: 'NOT_MEASURED' },
    overall: { key: 'overall', label: 'Overall Score', status: 'NOT_MEASURED', value: null, evidenceRefs: [], method: 'GOVERNED_AGGREGATION_POLICY_REQUIRED' },
  },
  mostImportantRisk: {
    id: 'risk-1', title: 'Capability not verified', severity: 'HIGH', priorityRank: 1, status: 'UNRESOLVED',
    evidenceRefs: [{ type: 'AI_CAPABILITY_RESULT', id: 'capability-1' }], businessMeaning: 'Verification is incomplete.',
  },
  businessImpact: [],
  findings: [{
    id: 'risk-1', title: 'Capability not verified', severity: 'HIGH', priorityRank: 1, status: 'UNRESOLVED',
    evidenceRefs: [{ type: 'AI_CAPABILITY_RESULT', id: 'capability-1' }], businessMeaning: 'Verification is incomplete.',
  }],
  autonomousActivity: { totalAgentTasks: 6, autonomousActions: 0, humanInterventions: 0, changesRevalidated: 0, unresolvedIssues: 1 },
  unresolvedStatement: '1 issue remains unresolved.',
  assuranceStatement: 'Independent certification is not complete; current certification coverage is 98%.',
  evidenceRefs: [{ type: 'AI_CAPABILITY_E2E_RUN', id: 'cap-run-1' }],
}

test('executive export stays within the intended 5 to 10 slide story', () => {
  const slides = buildExecutiveSlides(report)
  assert.ok(slides.length >= 5 && slides.length <= 10)
  assert.equal(slides[0].title, 'DataNexus Governance Outcome')
  assert.equal(slides.at(-1).title, 'Assurance and Next Outlook')
})

test('pptx export is an OOXML zip with canonical presentation parts', () => {
  const pptx = renderGovernanceReportPptx(report)
  assert.equal(pptx.subarray(0, 2).toString('ascii'), 'PK')
  assert.ok(pptx.includes(Buffer.from('[Content_Types].xml')))
  assert.ok(pptx.includes(Buffer.from('ppt/presentation.xml')))
  assert.ok(pptx.includes(Buffer.from('ppt/slides/slide1.xml')))
  assert.ok(pptx.length > 5000)
})

test('pdf export emits a complete PDF document from the same canonical story', () => {
  const pdf = renderGovernanceReportPdf(report)
  assert.equal(pdf.subarray(0, 8).toString('ascii'), '%PDF-1.4')
  assert.ok(pdf.includes(Buffer.from('/Type /Catalog')))
  assert.ok(pdf.includes(Buffer.from('%%EOF')))
  assert.ok(pdf.length > 1000)
})

test('narration script stays evidence-only when scores and business impact are not measured', () => {
  const script = buildExecutiveNarrationScript(report)
  assert.match(script, /No governed overall or dimension score is being narrated/)
  assert.match(script, /Business impact is not claimed/)
  assert.match(script, /1 issue remains unresolved/)
  assert.doesNotMatch(script, /saved \$|revenue increased|risk reduced by/)
})
