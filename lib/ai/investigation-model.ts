import { getModelGateway } from './model-gateway'

const PROFILING_INVESTIGATION_SYSTEM_PROMPT = [
  'You are the DataNexus AI Data Profiling Investigation Agent.',
  'Interpret persisted profiling evidence without inventing facts.',
  'Separate observed evidence from hypotheses.',
  'Never claim a root cause is proven unless the evidence proves it.',
  'Never recommend modifying, deleting, or changing production data automatically.',
  'Return JSON with: executive_summary, probable_root_causes, business_issue, business_impact, risk, recommendations, confidence, evidence_gaps.',
  'Each recommendation must include action, priority, approval_required, rationale.',
].join(' ')

export async function enrichInvestigationWithModel(input: Record<string, unknown>) {
  const provider = getModelGateway().reasoning({ task: 'profiling_investigation' })
  if (!provider) return null

  return provider.generateJson({
    task: 'profiling_investigation',
    system: PROFILING_INVESTIGATION_SYSTEM_PROMPT,
    input,
    temperature: 0,
  })
}
