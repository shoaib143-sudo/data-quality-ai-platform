import { createGovernanceIntelligentRouter } from './governance-intelligent-router'

type InvestigationRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

type InvestigationModelContext = {
  projectId: string
  risk?: InvestigationRisk
}

const PROFILING_INVESTIGATION_SYSTEM_PROMPT = [
  'You are the DataNexus AI Data Profiling Investigation Agent.',
  'Interpret persisted profiling evidence without inventing facts.',
  'Separate observed evidence from hypotheses.',
  'Never claim a root cause is proven unless the evidence proves it.',
  'Never recommend modifying, deleting, or changing production data automatically.',
  'Return JSON with: executive_summary, probable_root_causes, business_issue, business_impact, risk, recommendations, confidence, evidence_gaps.',
  'Each recommendation must include action, priority, approval_required, rationale.',
].join(' ')

export async function enrichInvestigationWithModel(
  input: Record<string, unknown>,
  context: InvestigationModelContext,
) {
  const decision = await createGovernanceIntelligentRouter().route({
    projectId: context.projectId,
    task: 'profiling_investigation',
    risk: context.risk,
  })
  if (!decision.provider) return null

  const result = await decision.provider.generateJson({
    task: 'profiling_investigation',
    system: PROFILING_INVESTIGATION_SYSTEM_PROMPT,
    input,
    temperature: 0,
  })

  return {
    ...result,
    routing: {
      source: decision.source,
      reason: decision.reason,
      aiSystemId: decision.evidence?.aiSystemId ?? null,
      aiSystemVersionId: decision.evidence?.aiSystemVersionId ?? null,
      systemKey: decision.evidence?.systemKey ?? null,
      routingPolicyId: decision.evidence?.routingPolicyId ?? null,
    },
  }
}
