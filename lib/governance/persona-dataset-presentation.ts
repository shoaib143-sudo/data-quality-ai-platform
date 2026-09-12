import type { PersonaSlug } from '@/lib/governance/personas'
import { buildPersonaPresentationPlan } from '@/lib/governance/persona-presentation'

export type DatasetMetricKey = 'quality' | 'issues' | 'accountability' | 'classification' | 'glossary' | 'critical-data'
export type DatasetSectionKey = 'quality' | 'issues' | 'findings' | 'governance'

export type DatasetPresentationPlan = {
  persona: PersonaSlug
  objective: string
  lensLabel: string
  primaryQuestion: string
  metricOrder: DatasetMetricKey[]
  sectionOrder: DatasetSectionKey[]
  qualityTitle: string
  findingsTitle: string
  issueTitle: string
  truthBoundary: 'GOVERNED_OUTCOME_ONLY'
  authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE'
}

const PERSONA_DATASET_LENS: Record<PersonaSlug, Omit<DatasetPresentationPlan, 'persona' | 'objective' | 'truthBoundary' | 'authorizationBoundary'>> = {
  'senior-leadership': { lensLabel: 'Executive trust view', primaryQuestion: 'Can this dataset be trusted for material business decisions?', metricOrder: ['quality','issues','accountability','critical-data','classification','glossary'], sectionOrder: ['issues','quality','findings','governance'], qualityTitle: 'Trust and quality evidence', findingsTitle: 'Material evidence requiring attention', issueTitle: 'Business risks linked to this dataset' },
  'business-user': { lensLabel: 'Trusted-use view', primaryQuestion: 'Can I safely use this dataset for my business need?', metricOrder: ['quality','glossary','issues','classification','accountability','critical-data'], sectionOrder: ['quality','issues','governance','findings'], qualityTitle: 'Fitness-for-use evidence', findingsTitle: 'Known evidence and limitations', issueTitle: 'Known concerns affecting use' },
  'data-owner': { lensLabel: 'Owner decision view', primaryQuestion: 'What risk, accountability or decision requires my attention?', metricOrder: ['issues','quality','accountability','critical-data','classification','glossary'], sectionOrder: ['issues','findings','quality','governance'], qualityTitle: 'Quality evidence behind owner decisions', findingsTitle: 'Evidence requiring owner action', issueTitle: 'Open owner risks and decisions' },
  'data-product-owner': { lensLabel: 'Product trust view', primaryQuestion: 'Is this dataset trustworthy for downstream consumers?', metricOrder: ['quality','issues','critical-data','accountability','classification','glossary'], sectionOrder: ['quality','issues','findings','governance'], qualityTitle: 'Product trust evidence', findingsTitle: 'Consumer-impacting findings', issueTitle: 'Open product risks' },
  'data-steward': { lensLabel: 'Steward investigation view', primaryQuestion: 'What needs investigation, curation or remediation?', metricOrder: ['issues','quality','classification','glossary','accountability','critical-data'], sectionOrder: ['issues','findings','quality','governance'], qualityTitle: 'Evidence for stewardship investigation', findingsTitle: 'Findings requiring investigation', issueTitle: 'Stewardship work queue' },
  'data-governance-specialist': { lensLabel: 'Governance effectiveness view', primaryQuestion: 'Where are the governance gaps for this dataset?', metricOrder: ['accountability','critical-data','classification','glossary','issues','quality'], sectionOrder: ['governance','issues','quality','findings'], qualityTitle: 'Quality evidence supporting governance', findingsTitle: 'Governance-relevant findings', issueTitle: 'Governance gaps and exceptions' },
  'compliance-risk-officer': { lensLabel: 'Control assurance view', primaryQuestion: 'What control or risk exposure is evidenced for this dataset?', metricOrder: ['issues','classification','critical-data','quality','accountability','glossary'], sectionOrder: ['issues','governance','findings','quality'], qualityTitle: 'Quality evidence supporting assurance', findingsTitle: 'Assurance evidence requiring review', issueTitle: 'Control and risk exposure' },
  'privacy-security-officer': { lensLabel: 'Privacy exposure view', primaryQuestion: 'What sensitive-data and downstream exposure is evidenced here?', metricOrder: ['classification','issues','critical-data','accountability','quality','glossary'], sectionOrder: ['governance','issues','findings','quality'], qualityTitle: 'Supporting data-quality evidence', findingsTitle: 'Privacy-relevant findings', issueTitle: 'Privacy and security concerns' },
  'data-governance-admin': { lensLabel: 'Governance operations view', primaryQuestion: 'Is the governed dataset lifecycle operating correctly?', metricOrder: ['quality','issues','accountability','classification','critical-data','glossary'], sectionOrder: ['quality','issues','findings','governance'], qualityTitle: 'Profiling execution evidence', findingsTitle: 'Operational findings', issueTitle: 'Operational governance issues' },
  'data-custodian': { lensLabel: 'Technical remediation view', primaryQuestion: 'What technical evidence should I investigate or remediate?', metricOrder: ['quality','issues','critical-data','classification','accountability','glossary'], sectionOrder: ['quality','findings','issues','governance'], qualityTitle: 'Technical profiling evidence', findingsTitle: 'Technical findings requiring remediation', issueTitle: 'Open technical issues' },
  'source-system-owner': { lensLabel: 'Source impact view', primaryQuestion: 'Is the source contributing to downstream quality or governance risk?', metricOrder: ['quality','issues','critical-data','accountability','classification','glossary'], sectionOrder: ['quality','findings','issues','governance'], qualityTitle: 'Source-linked quality evidence', findingsTitle: 'Potential upstream-impact findings', issueTitle: 'Source-linked governed issues' },
  'metadata-analyst': { lensLabel: 'Metadata intelligence view', primaryQuestion: 'What metadata, ownership, glossary or classification gaps exist?', metricOrder: ['glossary','classification','accountability','critical-data','quality','issues'], sectionOrder: ['governance','quality','issues','findings'], qualityTitle: 'Supporting profiling evidence', findingsTitle: 'Metadata-relevant findings', issueTitle: 'Governed metadata issues' },
  'data-quality-analyst': { lensLabel: 'Quality diagnostics view', primaryQuestion: 'What does the profiling evidence say about quality and root cause?', metricOrder: ['quality','issues','critical-data','classification','accountability','glossary'], sectionOrder: ['quality','findings','issues','governance'], qualityTitle: 'Quality dimension diagnostics', findingsTitle: 'Profiling findings requiring analysis', issueTitle: 'Open data-quality issues' },
}

export function buildDatasetPresentationPlan(persona: PersonaSlug): DatasetPresentationPlan {
  const base = buildPersonaPresentationPlan(persona)
  const lens = PERSONA_DATASET_LENS[persona]
  return {
    persona,
    objective: base.objective,
    ...lens,
    truthBoundary: base.truthBoundary,
    authorizationBoundary: base.authorizationBoundary,
  }
}
