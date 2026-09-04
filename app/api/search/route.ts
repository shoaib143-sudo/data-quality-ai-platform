import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { embedGovernanceText, semanticSearchByEmbedding, type SemanticMatch } from '@/lib/governance/semantic-search'
import { createClient } from '@/lib/supabase/server'

type SearchResult = {
  kind: string
  id: string
  projectId: string
  label: string
  description: string | null
  href: string
  score: number
  metadata: Record<string, unknown>
}

function lexicalScore(label: string, description: string | null, query: string, kind: string) {
  const normalized = query.toLowerCase()
  const name = label.toLowerCase()
  const body = (description ?? '').toLowerCase()
  let value = 0
  if (name === normalized) value += 100
  else if (name.startsWith(normalized)) value += 70
  else if (name.includes(normalized)) value += 50
  if (body.includes(normalized)) value += 20
  if (kind === 'DATASET') value += 8
  if (kind === 'GLOSSARY_TERM') value += 6
  return value
}

function firstLine(value: string) {
  return value.split('\n').map((part) => part.trim()).find(Boolean) ?? value
}

function textMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function semanticResult(projectId: string, match: SemanticMatch): SearchResult {
  const metadata = match.metadata ?? {}
  const objectId = match.object_id ?? match.object_key
  const datasetName = textMetadata(metadata, 'dataset_name')
  const columnName = textMetadata(metadata, 'column_name')
  const profileRunId = textMetadata(metadata, 'profile_run_id')
  const externalId = textMetadata(metadata, 'external_id')
  let label = firstLine(match.content)
  let href = '/dashboard'

  switch (match.object_type) {
    case 'DATASET':
      label = textMetadata(metadata, 'name') ?? label
      href = `/catalog?dataset=${encodeURIComponent(objectId)}`
      break
    case 'COLUMN':
      label = datasetName && columnName ? `${datasetName}.${columnName}` : columnName ?? label
      href = profileRunId
        ? `/profiling/explorer?runId=${encodeURIComponent(profileRunId)}&columnId=${encodeURIComponent(objectId)}`
        : '/profiling/explorer'
      break
    case 'FINDING':
      href = profileRunId
        ? `/profiling/explorer?runId=${encodeURIComponent(profileRunId)}&findingId=${encodeURIComponent(objectId)}`
        : '/profiling/explorer'
      break
    case 'GLOSSARY_TERM':
      label = textMetadata(metadata, 'term') ?? label
      href = `/glossary?term=${encodeURIComponent(objectId)}`
      break
    case 'POLICY':
      label = textMetadata(metadata, 'name') ?? label
      href = `/classification?policy=${encodeURIComponent(objectId)}`
      break
    case 'LINEAGE_TRANSFORMATION':
      label = textMetadata(metadata, 'name') ?? externalId ?? label
      href = `/lineage?transformation=${encodeURIComponent(objectId)}`
      break
  }

  return {
    kind: match.object_type,
    id: objectId,
    projectId,
    label,
    description: match.content,
    href,
    score: Math.max(0, Math.min(1, Number(match.similarity) || 0)) * 60,
    metadata: { ...metadata, similarity: match.similarity, semantic: true },
  }
}

function mergeResults(lexical: SearchResult[], semantic: SearchResult[]) {
  const merged = new Map<string, SearchResult>()
  for (const item of lexical) merged.set(`${item.kind}:${item.id}`, item)
  for (const item of semantic) {
    const key = `${item.kind}:${item.id}`
    const existing = merged.get(key)
    if (existing) {
      merged.set(key, {
        ...existing,
        score: existing.score + item.score,
        metadata: { ...existing.metadata, ...item.metadata },
      })
    } else {
      merged.set(key, item)
    }
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 75)
}

export async function GET(request: Request) {
  await requireUser()
  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? '').trim()
  if (query.length < 2) return NextResponse.json({ query, count: 0, results: [], semantic: { status: 'SKIPPED' } })

  const supabase = await createClient()
  const pattern = `%${query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`

  const [datasets, terms, issues, labels, policies, contracts] = await Promise.all([
    supabase.schema('catalog').from('datasets').select('id,project_id,name,description,business_domain,source_identifier').or(`name.ilike.${pattern},description.ilike.${pattern},business_domain.ilike.${pattern},source_identifier.ilike.${pattern}`).limit(30),
    supabase.schema('governance').from('glossary_terms').select('id,project_id,term,definition,domain,status').or(`term.ilike.${pattern},definition.ilike.${pattern},domain.ilike.${pattern}`).limit(30),
    supabase.schema('governance').from('issues').select('id,project_id,dataset_id,title,description,status,severity').or(`title.ilike.${pattern},description.ilike.${pattern}`).limit(30),
    supabase.schema('governance').from('classification_labels').select('id,project_id,name,description,sensitivity_level').or(`name.ilike.${pattern},description.ilike.${pattern}`).limit(30),
    supabase.schema('governance').from('classification_policies').select('id,project_id,name,description,required_controls,retention_days,encryption_required,masking_required,approval_required').or(`name.ilike.${pattern},description.ilike.${pattern}`).limit(30),
    supabase.schema('governance').from('data_contracts').select('id,project_id,dataset_id,name,status,current_version').ilike('name', pattern).limit(30),
  ])

  for (const [label, result] of [
    ['datasets', datasets],
    ['glossary terms', terms],
    ['issues', issues],
    ['classification labels', labels],
    ['policies', policies],
    ['contracts', contracts],
  ] as const) {
    if (result.error) throw new Error(`Unable to search ${label}: ${result.error.message}`)
  }

  const lexical: SearchResult[] = [
    ...(datasets.data ?? []).map((item) => ({ kind: 'DATASET', id: item.id, projectId: item.project_id, label: item.name, description: item.description ?? item.business_domain ?? item.source_identifier, href: `/catalog?dataset=${item.id}`, metadata: { domain: item.business_domain, source: item.source_identifier } })),
    ...(terms.data ?? []).map((item) => ({ kind: 'GLOSSARY_TERM', id: item.id, projectId: item.project_id, label: item.term, description: item.definition, href: `/glossary?term=${item.id}`, metadata: { domain: item.domain, status: item.status } })),
    ...(issues.data ?? []).map((item) => ({ kind: 'ISSUE', id: item.id, projectId: item.project_id, label: item.title, description: item.description, href: `/issues?issue=${item.id}`, metadata: { status: item.status, severity: item.severity, dataset_id: item.dataset_id } })),
    ...(labels.data ?? []).map((item) => ({ kind: 'CLASSIFICATION', id: item.id, projectId: item.project_id, label: item.name, description: item.description, href: `/classification?label=${item.id}`, metadata: { sensitivity_level: item.sensitivity_level } })),
    ...(policies.data ?? []).map((item) => ({ kind: 'POLICY', id: item.id, projectId: item.project_id, label: item.name, description: item.description, href: `/classification?policy=${item.id}`, metadata: { required_controls: item.required_controls, retention_days: item.retention_days, encryption_required: item.encryption_required, masking_required: item.masking_required, approval_required: item.approval_required } })),
    ...(contracts.data ?? []).map((item) => ({ kind: 'DATA_CONTRACT', id: item.id, projectId: item.project_id, label: item.name, description: `Contract v${item.current_version} · ${item.status}`, href: `/contracts?dataset=${item.dataset_id}`, metadata: { status: item.status, dataset_id: item.dataset_id, current_version: item.current_version } })),
  ].map((item) => ({ ...item, score: lexicalScore(item.label, item.description, query, item.kind) }))

  let semantic: SearchResult[] = []
  let semanticStatus: 'ENABLED' | 'NOT_CONFIGURED' | 'UNAVAILABLE' = 'ENABLED'
  try {
    const [{ data: projects, error: projectError }, embedding] = await Promise.all([
      supabase.schema('app').from('projects').select('id'),
      embedGovernanceText(query),
    ])
    if (projectError) throw new Error(`Unable to enumerate searchable projects: ${projectError.message}`)
    const projectIds = (projects ?? []).map((project) => project.id)
    const perProjectLimit = Math.max(5, Math.ceil(75 / Math.max(1, projectIds.length)))
    const groups = await Promise.all(
      projectIds.map(async (projectId) => ({
        projectId,
        matches: await semanticSearchByEmbedding(supabase, {
          projectId,
          embedding,
          objectTypes: ['DATASET', 'COLUMN', 'FINDING', 'GLOSSARY_TERM', 'POLICY', 'LINEAGE_TRANSFORMATION'],
          limit: perProjectLimit,
          threshold: 0.35,
        }),
      })),
    )
    semantic = groups.flatMap(({ projectId, matches }) => matches.map((match) => semanticResult(projectId, match)))
  } catch (error) {
    semanticStatus = error instanceof Error && error.name === 'EmbeddingProviderNotConfiguredError' ? 'NOT_CONFIGURED' : 'UNAVAILABLE'
    if (semanticStatus === 'UNAVAILABLE') console.error('Hybrid semantic search unavailable', error)
  }

  const results = mergeResults(lexical, semantic)
  return NextResponse.json({
    query,
    count: results.length,
    results,
    semantic: { status: semanticStatus, matches: semantic.length },
  })
}
