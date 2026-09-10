import {
  getGovernedAgentPolicy,
  type GovernedAgentKey,
} from '@/lib/agents/governed-agent-registry'

type JsonRecord = Record<string, any>

type SpecialistContextLike = {
  datasets: JsonRecord[]
  versions: JsonRecord[]
  profileRuns: JsonRecord[]
  scorecards: JsonRecord[]
  cdes: JsonRecord[]
  cdeMappings: JsonRecord[]
  accountability: JsonRecord[]
  contracts: JsonRecord[]
  certifications: JsonRecord[]
  issues: JsonRecord[]
  incidents: JsonRecord[]
  remediationKnowledge: JsonRecord[]
  alerts: JsonRecord[]
  ruleRuns: JsonRecord[]
  comparisons: JsonRecord[]
  anomalies: JsonRecord[]
  knowledgeDocuments: JsonRecord[]
  glossaryTerms: JsonRecord[]
  regulatoryApplicability: JsonRecord[]
  lineageAssets: JsonRecord[]
  lineageTransformations: JsonRecord[]
  lineageColumnMappings: JsonRecord[]
  lineageTransformationEdges: JsonRecord[]
  lineageEdgeCount: number
}

type KnowledgeMatchLike = {
  object_type?: unknown
  object_key?: unknown
  title?: unknown
  relevance?: unknown
  metadata?: unknown
}

type GraphLike = {
  anchor: { type: string; key: string } | null
  edges: Array<Record<string, unknown>>
}

export type InvestigationEvidenceAuthority =
  | 'AUTHORITATIVE'
  | 'OBSERVED_EVIDENCE'
  | 'PROPOSED_NON_AUTHORITATIVE'
  | 'REFERENCE_CONTEXT'

export type InvestigationEvidenceRef = {
  ref: string
  source: string
  id: string
  authority: InvestigationEvidenceAuthority
  observedAt: string | null
}

export type GovernedInvestigation = {
  contractVersion: '1.0'
  scope: {
    projectId: string
    organizationId: string | null
    agentKey: GovernedAgentKey
    question: string | null
    projectScoped: true
    authorizationCapability: 'agent.execute'
  }
  role: ReturnType<typeof getGovernedAgentPolicy>
  queryPlan: {
    truth: 'AUTHORITATIVE_POSTGRES'
    knowledge: 'GOVERNED_LEXICAL_SEARCH'
    graph: 'BOUNDED_GOVERNANCE_GRAPH'
    history: 'BOUNDED_PROFILE_DQ_AND_REMEDIATION_HISTORY'
    roleFocus: readonly string[]
    toolAllowlist: readonly string[]
    handoffTargets: readonly GovernedAgentKey[]
  }
  evidenceBundle: {
    sourceCounts: Record<string, number>
    authorityCounts: Record<InvestigationEvidenceAuthority, number>
    datasetIds: string[]
    provenance: InvestigationEvidenceRef[]
    knowledgeMatches: KnowledgeMatchLike[]
    graph: GraphLike
    limits: {
      maxKnowledgeMatches: 20
      maxGraphEdges: 100
      maxProvenanceRefs: 1200
      sourceRowsPerDomain: 150
    }
  }
  reasoning: {
    observations: unknown[]
    hypotheses: unknown[]
    recommendations: unknown[]
    priorities: unknown[]
    referencedEvidenceIds: string[]
  }
  grounding: {
    status: 'GROUNDED' | 'FAILED'
    referencedEvidenceCount: number
    unsupportedEvidenceIds: string[]
    evidenceRefCount: number
    sourceCount: number
  }
  mutation: {
    productionMutationPerformed: false
    governanceMutationPerformed: false
    boundary: ReturnType<typeof getGovernedAgentPolicy>['mutationBoundary']
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PROVENANCE_REFS = 1200
const SOURCE_ROWS_PER_DOMAIN = 150

function upper(value: unknown) {
  return typeof value === 'string' ? value.toUpperCase() : ''
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function rows(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
}

function observedAt(row: JsonRecord) {
  for (const key of ['evaluated_at', 'observed_at', 'completed_at', 'updated_at', 'created_at', 'last_seen_at', 'started_at']) {
    const value = text(row[key])
    if (value) return value
  }
  return null
}

function authorityFor(source: string, row: JsonRecord): InvestigationEvidenceAuthority {
  if (source.startsWith('profiling.')) return 'OBSERVED_EVIDENCE'
  if (source === 'governance.cde_mappings') {
    return ['APPROVED', 'ACTIVE'].includes(upper(row.status)) ? 'AUTHORITATIVE' : 'PROPOSED_NON_AUTHORITATIVE'
  }
  if (source === 'governance.data_contracts') {
    return ['ACTIVE', 'APPROVED'].includes(upper(row.status)) ? 'AUTHORITATIVE' : 'PROPOSED_NON_AUTHORITATIVE'
  }
  if (source === 'governance.dataset_certifications') {
    return ['CERTIFIED', 'PROVISIONAL'].includes(upper(row.certification_status)) ? 'AUTHORITATIVE' : 'PROPOSED_NON_AUTHORITATIVE'
  }
  if (source === 'governance.critical_data_elements') {
    return ['ACTIVE', 'APPROVED'].includes(upper(row.status)) ? 'AUTHORITATIVE' : 'PROPOSED_NON_AUTHORITATIVE'
  }
  if (source === 'governance.knowledge_documents') {
    return upper(row.status) === 'ACTIVE' ? 'AUTHORITATIVE' : 'PROPOSED_NON_AUTHORITATIVE'
  }
  if (source === 'governance.accountability_assignments') {
    return upper(row.status) === 'ACTIVE' ? 'AUTHORITATIVE' : 'PROPOSED_NON_AUTHORITATIVE'
  }
  if (source.startsWith('governance.')) return 'REFERENCE_CONTEXT'
  return 'REFERENCE_CONTEXT'
}

function sourceRows(context: SpecialistContextLike): Array<[string, JsonRecord[]]> {
  return [
    ['catalog.datasets', context.datasets],
    ['catalog.dataset_versions', context.versions],
    ['profiling.profile_runs', context.profileRuns],
    ['profiling.quality_rule_runs', context.ruleRuns],
    ['profiling.profile_comparisons', context.comparisons],
    ['profiling.profile_anomalies', context.anomalies],
    ['profiling.observability_alerts', context.alerts],
    ['governance.project_scorecard_snapshots', context.scorecards],
    ['governance.critical_data_elements', context.cdes],
    ['governance.cde_mappings', context.cdeMappings],
    ['governance.accountability_assignments', context.accountability],
    ['governance.data_contracts', context.contracts],
    ['governance.dataset_certifications', context.certifications],
    ['governance.issues', context.issues],
    ['governance.observability_incidents', context.incidents],
    ['governance.remediation_knowledge', context.remediationKnowledge],
    ['governance.knowledge_documents', context.knowledgeDocuments],
    ['governance.glossary_terms', context.glossaryTerms],
    ['governance.regulatory_applicability', context.regulatoryApplicability],
    ['governance.lineage_assets', context.lineageAssets],
    ['governance.lineage_transformations', context.lineageTransformations],
    ['governance.lineage_column_mappings', context.lineageColumnMappings],
    ['governance.lineage_edges', context.lineageTransformationEdges],
  ]
}

function collectClaimEvidenceIds(value: unknown, output: Set<string>) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectClaimEvidenceIds(item, output)
    return
  }
  const record = value as Record<string, unknown>
  for (const [key, child] of Object.entries(record)) {
    if (key === 'evidence' && Array.isArray(child)) {
      for (const item of child) {
        if (typeof item === 'string' && UUID_PATTERN.test(item)) output.add(item)
      }
      continue
    }
    if (['recommendations', 'hypotheses', 'priorities'].includes(key)) collectClaimEvidenceIds(child, output)
  }
}

function buildProvenance(context: SpecialistContextLike, requiredEvidenceIds: ReadonlySet<string>) {
  const refs: InvestigationEvidenceRef[] = []
  const counts: Record<string, number> = {}
  const seenRefs = new Set<string>()

  for (const [source, sourceData] of sourceRows(context)) {
    counts[source] = sourceData.length
    for (let index = 0; index < sourceData.length; index += 1) {
      const row = sourceData[index]
      const id = text(row.id)
      if (!id) continue
      if (index >= SOURCE_ROWS_PER_DOMAIN && !requiredEvidenceIds.has(id)) continue

      const ref = `${source}:${id}`
      if (seenRefs.has(ref)) continue
      seenRefs.add(ref)
      refs.push({
        ref,
        source,
        id,
        authority: authorityFor(source, row),
        observedAt: observedAt(row),
      })
      if (refs.length >= MAX_PROVENANCE_REFS) return { refs, counts }
    }
  }
  return { refs, counts }
}

function authorityCounts(provenance: InvestigationEvidenceRef[]) {
  const counts: Record<InvestigationEvidenceAuthority, number> = {
    AUTHORITATIVE: 0,
    OBSERVED_EVIDENCE: 0,
    PROPOSED_NON_AUTHORITATIVE: 0,
    REFERENCE_CONTEXT: 0,
  }
  for (const ref of provenance) counts[ref.authority] += 1
  return counts
}

export function buildGovernedInvestigation(input: {
  projectId: string
  organizationId?: string | null
  agentKey: GovernedAgentKey
  question?: string | null
  context: SpecialistContextLike
  specialist: Record<string, unknown>
  knowledgeMatches: KnowledgeMatchLike[]
  graph: GraphLike
}): GovernedInvestigation {
  const policy = getGovernedAgentPolicy(input.agentKey)
  const referencedEvidence = new Set<string>()
  collectClaimEvidenceIds(input.specialist, referencedEvidence)
  const provenanceResult = buildProvenance(input.context, referencedEvidence)
  const evidenceIds = new Set(provenanceResult.refs.map((ref) => ref.id))
  const unsupportedEvidenceIds = [...referencedEvidence].filter((id) => !evidenceIds.has(id)).sort()
  const datasetIds = [...new Set(rows(input.context.datasets).map((row) => text(row.id)).filter(Boolean))]

  return {
    contractVersion: '1.0',
    scope: {
      projectId: input.projectId,
      organizationId: input.organizationId ?? null,
      agentKey: input.agentKey,
      question: input.question?.trim() || null,
      projectScoped: true,
      authorizationCapability: 'agent.execute',
    },
    role: policy,
    queryPlan: {
      truth: 'AUTHORITATIVE_POSTGRES',
      knowledge: 'GOVERNED_LEXICAL_SEARCH',
      graph: 'BOUNDED_GOVERNANCE_GRAPH',
      history: 'BOUNDED_PROFILE_DQ_AND_REMEDIATION_HISTORY',
      roleFocus: policy.evidenceDomains,
      toolAllowlist: policy.toolAllowlist,
      handoffTargets: policy.handoffTargets,
    },
    evidenceBundle: {
      sourceCounts: provenanceResult.counts,
      authorityCounts: authorityCounts(provenanceResult.refs),
      datasetIds,
      provenance: provenanceResult.refs,
      knowledgeMatches: input.knowledgeMatches.slice(0, 20),
      graph: {
        anchor: input.graph.anchor,
        edges: input.graph.edges.slice(0, 100),
      },
      limits: {
        maxKnowledgeMatches: 20,
        maxGraphEdges: 100,
        maxProvenanceRefs: MAX_PROVENANCE_REFS,
        sourceRowsPerDomain: SOURCE_ROWS_PER_DOMAIN,
      },
    },
    reasoning: {
      observations: Array.isArray(input.specialist.observations) ? input.specialist.observations : [],
      hypotheses: Array.isArray(input.specialist.hypotheses) ? input.specialist.hypotheses : [],
      recommendations: Array.isArray(input.specialist.recommendations) ? input.specialist.recommendations : [],
      priorities: Array.isArray(input.specialist.priorities) ? input.specialist.priorities : [],
      referencedEvidenceIds: [...referencedEvidence].sort(),
    },
    grounding: {
      status: unsupportedEvidenceIds.length ? 'FAILED' : 'GROUNDED',
      referencedEvidenceCount: referencedEvidence.size,
      unsupportedEvidenceIds,
      evidenceRefCount: provenanceResult.refs.length,
      sourceCount: Object.keys(provenanceResult.counts).length,
    },
    mutation: {
      productionMutationPerformed: false,
      governanceMutationPerformed: false,
      boundary: policy.mutationBoundary,
    },
  }
}

export function assertGovernedInvestigationGrounding(investigation: GovernedInvestigation) {
  if (investigation.scope.projectScoped !== true) throw new Error('Governed investigation is not project scoped.')
  if (investigation.grounding.status !== 'GROUNDED') {
    throw new Error(`Governed investigation contains unsupported evidence references: ${investigation.grounding.unsupportedEvidenceIds.join(', ')}`)
  }
  if (investigation.mutation.productionMutationPerformed || investigation.mutation.governanceMutationPerformed) {
    throw new Error('Governed read-only investigation cannot report a production or governance mutation.')
  }
  return investigation
}
