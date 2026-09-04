import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSemanticObject, indexSemanticObject } from '@/lib/governance/semantic-search'

type KnowledgeDocumentRow = {
  id: string
  document_key: string
  document_type: string
  title: string
  summary: string | null
  content: string
  domain: string | null
  jurisdiction: string | null
  source_url: string | null
  metadata: Record<string, unknown> | null
}

type KnowledgeRequirementRow = {
  id: string
  document_id: string
  requirement_key: string
  title: string
  requirement_text: string
  obligation_type: string
  priority: string
  metadata: Record<string, unknown> | null
}

type CriticalDataElementRow = {
  id: string
  cde_key: string
  name: string
  definition: string
  domain: string
  criticality: string
  regulatory_relevance: string[] | null
  classification_label_id: string | null
  owner_role: string | null
  steward_role: string | null
  metadata: Record<string, unknown> | null
}

type Candidate = {
  objectType: 'KNOWLEDGE_DOCUMENT' | 'KNOWLEDGE_REQUIREMENT' | 'CRITICAL_DATA_ELEMENT'
  objectKey: string
  objectId: string
  content: string
  metadata: Record<string, unknown>
}

const MANAGED_TYPES = ['KNOWLEDGE_DOCUMENT', 'KNOWLEDGE_REQUIREMENT', 'CRITICAL_DATA_ELEMENT'] as const

function compact(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join('\n')
}

export async function collectProjectKnowledgeSemanticCandidates(projectId: string): Promise<Candidate[]> {
  const admin = createAdminClient()
  const [documents, requirements, cdes] = await Promise.all([
    admin
      .schema('governance')
      .from('knowledge_documents')
      .select('id,document_key,document_type,title,summary,content,domain,jurisdiction,source_url,metadata')
      .eq('project_id', projectId)
      .eq('status', 'ACTIVE')
      .limit(5000),
    admin
      .schema('governance')
      .from('knowledge_requirements')
      .select('id,document_id,requirement_key,title,requirement_text,obligation_type,priority,metadata')
      .eq('project_id', projectId)
      .limit(10000),
    admin
      .schema('governance')
      .from('critical_data_elements')
      .select('id,cde_key,name,definition,domain,criticality,regulatory_relevance,classification_label_id,owner_role,steward_role,metadata')
      .eq('project_id', projectId)
      .eq('status', 'ACTIVE')
      .limit(10000),
  ])

  if (documents.error) throw new Error(`Unable to collect governance knowledge documents: ${documents.error.message}`)
  if (requirements.error) throw new Error(`Unable to collect governance knowledge requirements: ${requirements.error.message}`)
  if (cdes.error) throw new Error(`Unable to collect critical data elements: ${cdes.error.message}`)

  const documentRows = (documents.data ?? []) as KnowledgeDocumentRow[]
  const requirementRows = (requirements.data ?? []) as KnowledgeRequirementRow[]
  const cdeRows = (cdes.data ?? []) as CriticalDataElementRow[]
  const documentById = new Map(documentRows.map((document) => [document.id, document]))

  return [
    ...documentRows.map((document) => ({
      objectType: 'KNOWLEDGE_DOCUMENT' as const,
      objectKey: document.document_key,
      objectId: document.id,
      content: compact([
        document.title,
        document.summary,
        `Document type: ${document.document_type}`,
        document.domain ? `Domain: ${document.domain}` : null,
        document.jurisdiction ? `Jurisdiction: ${document.jurisdiction}` : null,
        document.content,
      ]),
      metadata: {
        document_type: document.document_type,
        domain: document.domain,
        jurisdiction: document.jurisdiction,
        source_url: document.source_url,
        ...(document.metadata ?? {}),
      },
    })),
    ...requirementRows.map((requirement) => {
      const document = documentById.get(requirement.document_id)
      return {
        objectType: 'KNOWLEDGE_REQUIREMENT' as const,
        objectKey: requirement.requirement_key,
        objectId: requirement.id,
        content: compact([
          requirement.title,
          requirement.requirement_text,
          `Obligation type: ${requirement.obligation_type}`,
          `Priority: ${requirement.priority}`,
          document ? `Source document: ${document.title}` : null,
        ]),
        metadata: {
          document_id: requirement.document_id,
          document_key: document?.document_key ?? null,
          document_title: document?.title ?? null,
          obligation_type: requirement.obligation_type,
          priority: requirement.priority,
          ...(requirement.metadata ?? {}),
        },
      }
    }),
    ...cdeRows.map((cde) => ({
      objectType: 'CRITICAL_DATA_ELEMENT' as const,
      objectKey: cde.cde_key,
      objectId: cde.id,
      content: compact([
        cde.name,
        cde.definition,
        `Domain: ${cde.domain}`,
        `Criticality: ${cde.criticality}`,
        cde.regulatory_relevance?.length ? `Governance relevance: ${cde.regulatory_relevance.join(', ')}` : null,
        cde.owner_role ? `Owner role: ${cde.owner_role}` : null,
        cde.steward_role ? `Steward role: ${cde.steward_role}` : null,
      ]),
      metadata: {
        domain: cde.domain,
        criticality: cde.criticality,
        regulatory_relevance: cde.regulatory_relevance ?? [],
        classification_label_id: cde.classification_label_id,
        owner_role: cde.owner_role,
        steward_role: cde.steward_role,
        ...(cde.metadata ?? {}),
      },
    })),
  ]
}

export async function reindexProjectKnowledgeSemanticObjects(
  projectId: string,
  options: { concurrency?: number } = {},
) {
  const admin = createAdminClient()
  const candidates = await collectProjectKnowledgeSemanticCandidates(projectId)
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 3))
  let cursor = 0
  let indexed = 0
  let failed = 0
  const errors: string[] = []

  async function worker() {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++]
      try {
        await indexSemanticObject({
          projectId,
          objectType: candidate.objectType,
          objectKey: candidate.objectKey,
          objectId: candidate.objectId,
          content: candidate.content,
          metadata: candidate.metadata,
        })
        indexed += 1
      } catch (error) {
        failed += 1
        errors.push(error instanceof Error ? error.message : 'Governance knowledge semantic indexing failed.')
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, candidates.length)) }, () => worker()))

  const active = new Set(candidates.map((candidate) => `${candidate.objectType}:${candidate.objectKey}`))
  const { data: existing, error: existingError } = await admin
    .schema('governance')
    .from('semantic_embeddings')
    .select('object_type,object_key')
    .eq('project_id', projectId)
    .in('object_type', [...MANAGED_TYPES])
  if (existingError) throw new Error(`Unable to inspect indexed governance knowledge: ${existingError.message}`)

  let pruned = 0
  for (const row of existing ?? []) {
    const objectType = String(row.object_type)
    const objectKey = String(row.object_key)
    if (active.has(`${objectType}:${objectKey}`)) continue
    await deleteSemanticObject({ projectId, objectType, objectKey })
    pruned += 1
  }

  return { indexed, failed, pruned, errors: errors.slice(0, 20) }
}
