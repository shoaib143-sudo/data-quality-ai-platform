import { createAdminClient } from '@/lib/supabase/admin'
import { createGovernanceIntelligentRouter } from './governance-intelligent-router'

type InvestigationRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

type InvestigationModelContext = {
  projectId?: string | null
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

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function investigationRisk(input: Record<string, unknown>, context: InvestigationModelContext) {
  if (context.risk) return context.risk
  const risk = text(record(input.deterministic_investigation).risk).toUpperCase()
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(risk) ? risk as InvestigationRisk : undefined
}

async function resolveProjectId(input: Record<string, unknown>, context: InvestigationModelContext) {
  const supplied = text(context.projectId)
  if (supplied) return supplied

  const datasetVersionId = text(record(input.deterministic_investigation).dataset_version_id)
  if (!datasetVersionId) return null

  const admin = createAdminClient()
  const { data: version, error: versionError } = await admin
    .schema('catalog')
    .from('dataset_versions')
    .select('dataset_id')
    .eq('id', datasetVersionId)
    .maybeSingle()
  if (versionError) throw new Error(`Unable to resolve AI investigation dataset version: ${versionError.message}`)
  if (!version?.dataset_id) return null

  const { data: dataset, error: datasetError } = await admin
    .schema('catalog')
    .from('datasets')
    .select('project_id')
    .eq('id', version.dataset_id)
    .maybeSingle()
  if (datasetError) throw new Error(`Unable to resolve AI investigation project: ${datasetError.message}`)
  return text(dataset?.project_id) || null
}

export async function enrichInvestigationWithModel(
  input: Record<string, unknown>,
  context: InvestigationModelContext = {},
) {
  const projectId = await resolveProjectId(input, context)
  if (!projectId) return null

  const decision = await createGovernanceIntelligentRouter().route({
    projectId,
    task: 'profiling_investigation',
    risk: investigationRisk(input, context),
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
