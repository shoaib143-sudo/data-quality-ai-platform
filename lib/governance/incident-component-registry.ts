import type { IncidentComponentId } from './incident-presentation'
import type { IncidentEvidenceAuthority } from './governed-incident'

export type IncidentComponentDefinition = {
  id: IncidentComponentId
  purpose: string
  evidenceAuthorities: IncidentEvidenceAuthority[]
  mayMutateGovernanceTruth: false
  authorizationBoundary: 'EXTERNAL_TO_COMPONENT'
}

export const incidentComponentRegistry: Record<IncidentComponentId, IncidentComponentDefinition> = {
  'incident-summary': { id: 'incident-summary', purpose: 'Summarize canonical incident truth and lifecycle state.', evidenceAuthorities: ['ISSUE', 'AUDIT'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'trust-summary': { id: 'trust-summary', purpose: 'Explain fitness-for-use and trust impact using governed evidence.', evidenceAuthorities: ['ISSUE', 'PROFILING', 'DATA_QUALITY'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'risk-summary': { id: 'risk-summary', purpose: 'Present material severity and governed exposure without recalculating risk.', evidenceAuthorities: ['ISSUE', 'CONTROL', 'OBSERVABILITY'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'issue-queue': { id: 'issue-queue', purpose: 'Present governed issue state and authorized action entry points.', evidenceAuthorities: ['ISSUE', 'AUDIT'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'evidence-panel': { id: 'evidence-panel', purpose: 'Trace conclusions to authoritative source records.', evidenceAuthorities: ['ISSUE', 'PROFILING', 'DATA_QUALITY', 'OBSERVABILITY', 'LINEAGE', 'BUSINESS_CONTEXT', 'CONTROL', 'AUDIT', 'REMEDIATION'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'root-cause-panel': { id: 'root-cause-panel', purpose: 'Present governed or clearly advisory root-cause evidence.', evidenceAuthorities: ['DATA_QUALITY', 'OBSERVABILITY', 'PROFILING'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'lineage-impact': { id: 'lineage-impact', purpose: 'Present authoritative downstream lineage and business-context impact.', evidenceAuthorities: ['LINEAGE', 'BUSINESS_CONTEXT'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'decision-card': { id: 'decision-card', purpose: 'Present decisions and approvals without granting decision authority.', evidenceAuthorities: ['ISSUE', 'CONTROL', 'AUDIT'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'remediation-plan': { id: 'remediation-plan', purpose: 'Present governed remediation state and evidence.', evidenceAuthorities: ['ISSUE', 'REMEDIATION', 'AUDIT'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'verification-panel': { id: 'verification-panel', purpose: 'Compare before/after governed evidence and verification outcome.', evidenceAuthorities: ['PROFILING', 'DATA_QUALITY', 'REMEDIATION', 'AUDIT'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'control-status': { id: 'control-status', purpose: 'Present authoritative control state and exceptions.', evidenceAuthorities: ['CONTROL', 'AUDIT'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'execution-state': { id: 'execution-state', purpose: 'Present runtime and workflow state without changing durable job truth.', evidenceAuthorities: ['PROFILING', 'DATA_QUALITY', 'OBSERVABILITY', 'REMEDIATION'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'quality-trend': { id: 'quality-trend', purpose: 'Present governed quality evidence over time.', evidenceAuthorities: ['PROFILING', 'DATA_QUALITY'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
  'governance-history': { id: 'governance-history', purpose: 'Present auditable governance history and outcome evidence.', evidenceAuthorities: ['AUDIT', 'ISSUE', 'REMEDIATION'], mayMutateGovernanceTruth: false, authorizationBoundary: 'EXTERNAL_TO_COMPONENT' },
}

export function getIncidentComponentDefinition(id: IncidentComponentId): IncidentComponentDefinition {
  return incidentComponentRegistry[id]
}
