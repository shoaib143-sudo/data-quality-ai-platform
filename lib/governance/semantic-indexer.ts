import { createAdminClient } from '@/lib/supabase/admin'
import { indexSemanticObject } from '@/lib/governance/semantic-search'

type IndexCandidate = {
  objectType: string
  objectKey: string
  objectId?: string | null
  content: string
  metadata?: Record<string, unknown>
}

function compact(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join('\n')
}

export async function collectProjectSemanticCandidates(projectId: string): Promise<IndexCandidate[]> {
  const admin = createAdminClient()
  const [datasets, terms, policies, transformations] = await Promise.all([
    admin
      .schema('catalog')
      .from('datasets')
      .select('id,name,description,business_domain,source_identifier')
      .eq('project_id', projectId),
    admin
      .schema('governance')
      .from('glossary_terms')
      .select('id,term,definition,domain,synonyms,status')
      .eq('project_id', projectId),
    admin
      .schema('governance')
      .from('classification_policies')
      .select('id,name,description,required_controls,retention_days,encryption_required,masking_required,approval_required')
      .eq('project_id', projectId),
    admin
      .schema('governance')
      .from('lineage_transformations')
      .select('id,external_id,source_system,name,operation,logic_language,transformation_logic,metadata')
      .eq('project_id', projectId),
  ])

  for (const [label, result] of [
    ['datasets', datasets],
    ['glossary terms', terms],
    ['classification policies', policies],
    ['lineage transformations', transformations],
  ] as const) {
    if (result.error) throw new Error(`Unable to collect semantic ${label}: ${result.error.message}`)
  }

  return [
    ...(datasets.data ?? []).map((item) => ({
      objectType: 'DATASET',
      objectKey: item.id,
      objectId: item.id,
      content: compact([
        item.name,
        item.description,
        item.business_domain ? `Business domain: ${item.business_domain}` : null,
        item.source_identifier ? `Source: ${item.source_identifier}` : null,
      ]),
      metadata: {
        name: item.name,
        business_domain: item.business_domain,
        source_identifier: item.source_identifier,
      },
    })),
    ...(terms.data ?? []).map((item) => ({
      objectType: 'GLOSSARY_TERM',
      objectKey: item.id,
      objectId: item.id,
      content: compact([
        item.term,
        item.definition,
        item.domain ? `Domain: ${item.domain}` : null,
        item.synonyms?.length ? `Synonyms: ${item.synonyms.join(', ')}` : null,
      ]),
      metadata: { term: item.term, domain: item.domain, status: item.status },
    })),
    ...(policies.data ?? []).map((item) => ({
      objectType: 'POLICY',
      objectKey: item.id,
      objectId: item.id,
      content: compact([
        item.name,
        item.description,
        item.required_controls ? `Required controls: ${JSON.stringify(item.required_controls)}` : null,
        item.encryption_required ? 'Encryption required' : null,
        item.masking_required ? 'Masking required' : null,
        item.approval_required ? 'Approval required' : null,
      ]),
      metadata: {
        name: item.name,
        retention_days: item.retention_days,
        encryption_required: item.encryption_required,
        masking_required: item.masking_required,
        approval_required: item.approval_required,
      },
    })),
    ...(transformations.data ?? []).map((item) => ({
      objectType: 'LINEAGE_TRANSFORMATION',
      objectKey: item.external_id,
      objectId: item.id,
      content: compact([
        item.name ?? item.external_id,
        `Source system: ${item.source_system}`,
        `Operation: ${item.operation}`,
        item.logic_language ? `Language: ${item.logic_language}` : null,
        item.transformation_logic,
      ]),
      metadata: {
        external_id: item.external_id,
        source_system: item.source_system,
        operation: item.operation,
        logic_language: item.logic_language,
        ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
      },
    })),
  ].filter((candidate) => candidate.content.length > 0)
}

export async function reindexProjectSemanticObjects(
  projectId: string,
  options: { concurrency?: number } = {},
) {
  const candidates = await collectProjectSemanticCandidates(projectId)
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 3))
  const results: Array<{ objectType: string; objectKey: string; status: 'INDEXED' | 'FAILED'; error?: string }> = []
  let cursor = 0

  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= candidates.length) return
      const candidate = candidates[index]
      try {
        await indexSemanticObject({ projectId, ...candidate })
        results[index] = { objectType: candidate.objectType, objectKey: candidate.objectKey, status: 'INDEXED' }
      } catch (error) {
        results[index] = {
          objectType: candidate.objectType,
          objectKey: candidate.objectKey,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, candidates.length)) }, () => worker()))

  return {
    projectId,
    total: candidates.length,
    indexed: results.filter((result) => result.status === 'INDEXED').length,
    failed: results.filter((result) => result.status === 'FAILED').length,
    results,
  }
}
