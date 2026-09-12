import type { PersonaSlug } from './personas'
import type { GovernedIncident } from './governed-incident'
import { buildIncidentPresentationPlan, type IncidentComponentId, type IncidentPresentationPlan } from './incident-presentation'
import { getIncidentComponentDefinition, type IncidentComponentDefinition } from './incident-component-registry'

export type GovernedIncidentView = {
  incident: GovernedIncident
  plan: IncidentPresentationPlan
  components: IncidentComponentDefinition[]
  truthFingerprint: string
  presentationPolicyVersion: number
}

function stableTruthFingerprint(incident: GovernedIncident) {
  const truth = incident.truth
  return JSON.stringify({
    incidentId: truth.incidentId,
    projectId: truth.projectId,
    datasetId: truth.datasetId,
    datasetVersionId: truth.datasetVersionId,
    issueId: truth.issueId,
    severity: truth.severity,
    issueStatus: truth.issueStatus,
    ownerUserId: truth.ownerUserId,
    lifecycleState: truth.lifecycleState,
    verificationStatus: truth.verificationStatus,
    resolvedAt: truth.resolvedAt,
    evidenceVersion: incident.evidenceVersion,
  })
}

function uniqueComponents(ids: IncidentComponentId[]): IncidentComponentId[] {
  return ids.filter((id, index) => ids.indexOf(id) === index)
}

export function buildGovernedIncidentView(incident: GovernedIncident, persona: PersonaSlug): GovernedIncidentView {
  const plan = buildIncidentPresentationPlan(persona)
  const componentIds = uniqueComponents(plan.sectionOrder)
  const components = componentIds.map(getIncidentComponentDefinition)

  return {
    incident,
    plan,
    components,
    truthFingerprint: stableTruthFingerprint(incident),
    presentationPolicyVersion: plan.policyVersion,
  }
}
