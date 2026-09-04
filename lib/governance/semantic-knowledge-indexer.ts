import { createAdminClient } from '@/lib/supabase/admin'
import { deleteSemanticObject, indexSemanticObject } from '@/lib/governance/semantic-search'

type Candidate = {
  objectType: string
  objectKey: string
  objectId: string
  content: string
  metadata: Record<string, unknown>
}

const MANAGED_TYPES = [
  'KNOWLEDGE_DOCUMENT',
  'KNOWLEDGE_REQUIREMENT',
  'CRITICAL_DATA_ELEMENT',
  'DATA_CONTRACT',
  'CERTIFICATION',
  'REMEDIATION_KNOWLEDGE',
  'ACCOUNTABILITY_ASSIGNMENT',
  'REGULATORY_APPLICABILITY',
  'CLASSIFICATION',
] as const

function compact(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join('\n')
}

export async function collectProjectKnowledgeSemanticCandidates(projectId: string): Promise<Candidate[]> {
  const admin = createAdminClient()
  const [documents, requirements, cdes, contracts, certifications, remediation, accountability, applicability, classifications] = await Promise.all([
    admin.schema('governance').from('knowledge_documents')
      .select('id,document_key,document_type,title,summary,content,domain,jurisdiction,source_url,metadata')
      .eq('project_id', projectId).eq('status', 'ACTIVE').limit(5000),
    admin.schema('governance').from('knowledge_requirements')
      .select('id,document_id,requirement_key,title,requirement_text,obligation_type,priority,metadata')
      .eq('project_id', projectId).limit(10000),
    admin.schema('governance').from('critical_data_elements')
      .select('id,cde_key,name,definition,domain,criticality,regulatory_relevance,classification_label_id,owner_role,steward_role,metadata')
      .eq('project_id', projectId).eq('status', 'ACTIVE').limit(10000),
    admin.schema('governance').from('data_contracts')
      .select('id,dataset_id,name,status,current_version')
      .eq('project_id', projectId).limit(5000),
    admin.schema('governance').from('dataset_certifications')
      .select('id,dataset_id,certification_key,certification_status,certification_level,valid_from,valid_until,decision_summary,evidence,metadata')
      .eq('project_id', projectId).limit(5000),
    admin.schema('governance').from('remediation_knowledge')
      .select('id,dataset_id,issue_id,knowledge_key,problem_type,symptom,remediation_action,outcome_status,before_evidence,after_evidence,reusable_guidance,confidence,metadata')
      .eq('project_id', projectId).limit(10000),
    admin.schema('governance').from('accountability_assignments')
      .select('id,scope_type,scope_key,assignment_type,principal_type,principal_key,principal_name,accountability,status,metadata')
      .eq('project_id', projectId).eq('status', 'ACTIVE').limit(10000),
    admin.schema('governance').from('regulatory_applicability')
      .select('id,regulation_document_id,scope_type,scope_key,applicability_status,rationale,evidence,metadata')
      .eq('project_id', projectId).limit(10000),
    admin.schema('governance').from('classification_labels')
      .select('id,code,name,category,description,handling_requirements,enabled')
      .or(`project_id.eq.${projectId},project_id.is.null`).eq('enabled', true).limit(5000),
  ])

  for (const [label, result] of [
    ['documents', documents],
    ['requirements', requirements],
    ['critical data elements', cdes],
    ['data contracts', contracts],
    ['certifications', certifications],
    ['remediation knowledge', remediation],
    ['accountability assignments', accountability],
    ['regulatory applicability', applicability],
    ['classifications', classifications],
  ] as const) {
    if (result.error) throw new Error(`Unable to collect semantic governance ${label}: ${result.error.message}`)
  }

  const documentRows = documents.data ?? []
  const documentById = new Map(documentRows.map((document) => [document.id, document]))

  return [
    ...documentRows.map((document) => ({
      objectType: 'KNOWLEDGE_DOCUMENT', objectKey: document.document_key, objectId: document.id,
      content: compact([document.title, document.summary, `Document type: ${document.document_type}`, document.domain ? `Domain: ${document.domain}` : null, document.jurisdiction ? `Jurisdiction: ${document.jurisdiction}` : null, document.content]),
      metadata: { document_type: document.document_type, domain: document.domain, jurisdiction: document.jurisdiction, source_url: document.source_url, ...(document.metadata ?? {}) },
    })),
    ...(requirements.data ?? []).map((requirement) => {
      const document = documentById.get(requirement.document_id)
      return {
        objectType: 'KNOWLEDGE_REQUIREMENT', objectKey: requirement.requirement_key, objectId: requirement.id,
        content: compact([requirement.title, requirement.requirement_text, `Obligation type: ${requirement.obligation_type}`, `Priority: ${requirement.priority}`, document ? `Source document: ${document.title}` : null]),
        metadata: { document_id: requirement.document_id, document_key: document?.document_key ?? null, document_title: document?.title ?? null, obligation_type: requirement.obligation_type, priority: requirement.priority, ...(requirement.metadata ?? {}) },
      }
    }),
    ...(cdes.data ?? []).map((cde) => ({
      objectType: 'CRITICAL_DATA_ELEMENT', objectKey: cde.cde_key, objectId: cde.id,
      content: compact([cde.name, cde.definition, `Domain: ${cde.domain}`, `Criticality: ${cde.criticality}`, cde.regulatory_relevance?.length ? `Governance relevance: ${cde.regulatory_relevance.join(', ')}` : null, cde.owner_role ? `Owner role: ${cde.owner_role}` : null, cde.steward_role ? `Steward role: ${cde.steward_role}` : null]),
      metadata: { domain: cde.domain, criticality: cde.criticality, regulatory_relevance: cde.regulatory_relevance ?? [], classification_label_id: cde.classification_label_id, owner_role: cde.owner_role, steward_role: cde.steward_role, ...(cde.metadata ?? {}) },
    })),
    ...(contracts.data ?? []).map((contract) => ({
      objectType: 'DATA_CONTRACT', objectKey: contract.name, objectId: contract.id,
      content: compact([contract.name, `Status: ${contract.status}`, `Current version: ${contract.current_version}`, `Dataset: ${contract.dataset_id}`]),
      metadata: { dataset_id: contract.dataset_id, status: contract.status, current_version: contract.current_version },
    })),
    ...(certifications.data ?? []).map((certification) => ({
      objectType: 'CERTIFICATION', objectKey: certification.certification_key, objectId: certification.id,
      content: compact([certification.certification_key, `Status: ${certification.certification_status}`, `Level: ${certification.certification_level}`, certification.decision_summary, certification.valid_until ? `Valid until: ${certification.valid_until}` : null, JSON.stringify(certification.evidence ?? {})]),
      metadata: { dataset_id: certification.dataset_id, certification_status: certification.certification_status, certification_level: certification.certification_level, valid_from: certification.valid_from, valid_until: certification.valid_until, ...(certification.metadata ?? {}) },
    })),
    ...(remediation.data ?? []).map((item) => ({
      objectType: 'REMEDIATION_KNOWLEDGE', objectKey: item.knowledge_key, objectId: item.id,
      content: compact([item.problem_type, item.symptom, `Action: ${item.remediation_action}`, `Outcome: ${item.outcome_status}`, item.reusable_guidance, item.confidence === null ? null : `Confidence: ${item.confidence}`]),
      metadata: { dataset_id: item.dataset_id, issue_id: item.issue_id, outcome_status: item.outcome_status, confidence: item.confidence, before_evidence: item.before_evidence, after_evidence: item.after_evidence, ...(item.metadata ?? {}) },
    })),
    ...(accountability.data ?? []).map((item) => ({
      objectType: 'ACCOUNTABILITY_ASSIGNMENT', objectKey: `${item.scope_type}:${item.scope_key}:${item.assignment_type}:${item.principal_key}`, objectId: item.id,
      content: compact([item.principal_name, `Assignment: ${item.assignment_type}`, `Scope: ${item.scope_type} ${item.scope_key}`, item.accountability]),
      metadata: { scope_type: item.scope_type, scope_key: item.scope_key, assignment_type: item.assignment_type, principal_type: item.principal_type, principal_key: item.principal_key, ...(item.metadata ?? {}) },
    })),
    ...(applicability.data ?? []).map((item) => ({
      objectType: 'REGULATORY_APPLICABILITY', objectKey: `${item.regulation_document_id}:${item.scope_type}:${item.scope_key}`, objectId: item.id,
      content: compact([`Regulatory applicability: ${item.applicability_status}`, `Scope: ${item.scope_type} ${item.scope_key}`, item.rationale]),
      metadata: { regulation_document_id: item.regulation_document_id, scope_type: item.scope_type, scope_key: item.scope_key, applicability_status: item.applicability_status, evidence: item.evidence, ...(item.metadata ?? {}) },
    })),
    ...(classifications.data ?? []).map((item) => ({
      objectType: 'CLASSIFICATION', objectKey: item.code, objectId: item.id,
      content: compact([item.name, `Code: ${item.code}`, `Category: ${item.category}`, item.description, JSON.stringify(item.handling_requirements ?? {})]),
      metadata: { code: item.code, category: item.category, handling_requirements: item.handling_requirements },
    })),
  ].filter((candidate) => candidate.content.length > 0)
}

export async function reindexProjectKnowledgeSemanticObjects(projectId: string, options: { concurrency?: number } = {}) {
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
        await indexSemanticObject({ projectId, objectType: candidate.objectType, objectKey: candidate.objectKey, objectId: candidate.objectId, content: candidate.content, metadata: candidate.metadata })
        indexed += 1
      } catch (error) {
        failed += 1
        errors.push(error instanceof Error ? error.message : 'Governance knowledge semantic indexing failed.')
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, candidates.length)) }, () => worker()))

  const active = new Set(candidates.map((candidate) => `${candidate.objectType}:${candidate.objectKey}`))
  const { data: existing, error: existingError } = await admin.schema('governance').from('semantic_embeddings')
    .select('object_type,object_key').eq('project_id', projectId).in('object_type', [...MANAGED_TYPES])
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
