import { createAdminClient } from '@/lib/supabase/admin'
import { indexSemanticObject } from '@/lib/governance/semantic-search'

type IndexCandidate = {
  objectType: string
  objectKey: string
  objectId?: string | null
  content: string
  metadata?: Record<string, unknown>
}

type DatasetRow = {
  id: string
  name: string
  description: string | null
  business_domain: string | null
  source_identifier: string | null
}

type DatasetVersionRow = {
  id: string
  dataset_id: string
  version_number: number
}

type ProfileRunRow = {
  id: string
  dataset_version_id: string
}

type ProfileColumnRow = {
  id: string
  profile_run_id: string
  column_name: string
  source_type: string | null
  inferred_type: string | null
  semantic_type: string | null
  nullable: boolean | null
  confidence: number | null
  is_candidate_key: boolean
  key_confidence: number | null
  metadata: Record<string, unknown> | null
}

type ProfileFindingRow = {
  id: string
  profile_run_id: string
  profile_column_id: string | null
  finding_type: string
  severity: string
  title: string
  description: string
  confidence: number | null
  evidence: Record<string, unknown> | null
  recommendation: Record<string, unknown> | null
}

function compact(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join('\n')
}

function jsonSummary(value: unknown, prefix: string) {
  if (!value || typeof value !== 'object') return null
  const serialized = JSON.stringify(value)
  return serialized === '{}' || serialized === '[]' ? null : `${prefix}: ${serialized}`
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

  const datasetRows = (datasets.data ?? []) as DatasetRow[]
  const datasetIds = datasetRows.map((dataset) => dataset.id)
  let versionRows: DatasetVersionRow[] = []
  let runRows: ProfileRunRow[] = []
  let columnRows: ProfileColumnRow[] = []
  let findingRows: ProfileFindingRow[] = []

  if (datasetIds.length) {
    const versions = await admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id,dataset_id,version_number')
      .in('dataset_id', datasetIds)
    if (versions.error) throw new Error(`Unable to collect semantic dataset versions: ${versions.error.message}`)
    versionRows = (versions.data ?? []) as DatasetVersionRow[]

    const versionIds = versionRows.map((version) => version.id)
    if (versionIds.length) {
      const runs = await admin
        .schema('profiling')
        .from('profile_runs')
        .select('id,dataset_version_id')
        .in('dataset_version_id', versionIds)
      if (runs.error) throw new Error(`Unable to collect semantic profile runs: ${runs.error.message}`)
      runRows = (runs.data ?? []) as ProfileRunRow[]

      const runIds = runRows.map((run) => run.id)
      if (runIds.length) {
        const [columns, findings] = await Promise.all([
          admin
            .schema('profiling')
            .from('profile_columns')
            .select('id,profile_run_id,column_name,source_type,inferred_type,semantic_type,nullable,confidence,is_candidate_key,key_confidence,metadata')
            .in('profile_run_id', runIds),
          admin
            .schema('profiling')
            .from('profile_findings')
            .select('id,profile_run_id,profile_column_id,finding_type,severity,title,description,confidence,evidence,recommendation')
            .in('profile_run_id', runIds),
        ])
        if (columns.error) throw new Error(`Unable to collect semantic profile columns: ${columns.error.message}`)
        if (findings.error) throw new Error(`Unable to collect semantic profile findings: ${findings.error.message}`)
        columnRows = (columns.data ?? []) as ProfileColumnRow[]
        findingRows = (findings.data ?? []) as ProfileFindingRow[]
      }
    }
  }

  const datasetById = new Map(datasetRows.map((dataset) => [dataset.id, dataset]))
  const versionById = new Map(versionRows.map((version) => [version.id, version]))
  const runById = new Map(runRows.map((run) => [run.id, run]))
  const columnById = new Map(columnRows.map((column) => [column.id, column]))

  function profilingContext(profileRunId: string) {
    const run = runById.get(profileRunId)
    const version = run ? versionById.get(run.dataset_version_id) : undefined
    const dataset = version ? datasetById.get(version.dataset_id) : undefined
    return { run, version, dataset }
  }

  return [
    ...datasetRows.map((item) => ({
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
    ...columnRows.map((item) => {
      const { dataset, version } = profilingContext(item.profile_run_id)
      return {
        objectType: 'COLUMN',
        objectKey: item.id,
        objectId: item.id,
        content: compact([
          dataset ? `${dataset.name}.${item.column_name}` : item.column_name,
          dataset?.description,
          version ? `Dataset version: ${version.version_number}` : null,
          item.source_type ? `Source type: ${item.source_type}` : null,
          item.inferred_type ? `Inferred type: ${item.inferred_type}` : null,
          item.semantic_type ? `Semantic type: ${item.semantic_type}` : null,
          item.nullable === null ? null : `Nullable: ${item.nullable}`,
          item.is_candidate_key ? 'Candidate key' : null,
          item.confidence === null ? null : `Type confidence: ${item.confidence}`,
          item.key_confidence === null ? null : `Key confidence: ${item.key_confidence}`,
          jsonSummary(item.metadata, 'Metadata'),
        ]),
        metadata: {
          dataset_id: dataset?.id ?? null,
          dataset_name: dataset?.name ?? null,
          dataset_version_id: version?.id ?? null,
          dataset_version: version?.version_number ?? null,
          profile_run_id: item.profile_run_id,
          column_name: item.column_name,
          source_type: item.source_type,
          inferred_type: item.inferred_type,
          semantic_type: item.semantic_type,
          nullable: item.nullable,
          is_candidate_key: item.is_candidate_key,
        },
      }
    }),
    ...findingRows.map((item) => {
      const { dataset, version } = profilingContext(item.profile_run_id)
      const column = item.profile_column_id ? columnById.get(item.profile_column_id) : undefined
      return {
        objectType: 'FINDING',
        objectKey: item.id,
        objectId: item.id,
        content: compact([
          item.title,
          item.description,
          dataset ? `Dataset: ${dataset.name}` : null,
          version ? `Dataset version: ${version.version_number}` : null,
          column ? `Column: ${column.column_name}` : null,
          `Finding type: ${item.finding_type}`,
          `Severity: ${item.severity}`,
          item.confidence === null ? null : `Confidence: ${item.confidence}`,
          jsonSummary(item.evidence, 'Evidence'),
          jsonSummary(item.recommendation, 'Recommendation'),
        ]),
        metadata: {
          dataset_id: dataset?.id ?? null,
          dataset_name: dataset?.name ?? null,
          dataset_version_id: version?.id ?? null,
          dataset_version: version?.version_number ?? null,
          profile_run_id: item.profile_run_id,
          profile_column_id: item.profile_column_id,
          column_name: column?.column_name ?? null,
          finding_type: item.finding_type,
          severity: item.severity,
          confidence: item.confidence,
        },
      }
    }),
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
