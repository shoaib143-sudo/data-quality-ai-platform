import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject } from '@/lib/auth/authorize'
import { semanticSearch, type SemanticMatch } from '@/lib/governance/semantic-search'
import { createClient } from '@/lib/supabase/server'

type LexicalKnowledgeResult = {
  object_type: string
  object_key: string
  title: string
  content: string
  metadata: Record<string, unknown> | null
  relevance: number | string
}

function mergeKnowledge(
  lexical: LexicalKnowledgeResult[],
  semantic: SemanticMatch[],
) {
  const merged = new Map<string, Record<string, unknown>>()
  for (const item of lexical) {
    const key = `${item.object_type}:${item.object_key}`
    merged.set(key, {
      objectType: item.object_type,
      objectKey: item.object_key,
      objectId: null,
      title: item.title,
      content: item.content,
      metadata: item.metadata ?? {},
      lexicalRelevance: Number(item.relevance) || 0,
      semanticSimilarity: null,
      score: Number(item.relevance) || 0,
    })
  }

  for (const item of semantic) {
    const key = `${item.object_type}:${item.object_key}`
    const existing = merged.get(key)
    const similarity = Math.max(0, Math.min(1, Number(item.similarity) || 0))
    if (existing) {
      merged.set(key, {
        ...existing,
        objectId: item.object_id,
        metadata: { ...(existing.metadata as Record<string, unknown>), ...(item.metadata ?? {}) },
        semanticSimilarity: similarity,
        score: Number(existing.score) + similarity,
      })
      continue
    }
    merged.set(key, {
      objectType: item.object_type,
      objectKey: item.object_key,
      objectId: item.object_id,
      title: item.content.split('\n').find(Boolean) ?? item.object_key,
      content: item.content,
      metadata: item.metadata ?? {},
      lexicalRelevance: 0,
      semanticSimilarity: similarity,
      score: similarity,
    })
  }

  return [...merged.values()].sort((a, b) => Number(b.score) - Number(a.score))
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = (url.searchParams.get('projectId') ?? '').trim()
    const query = (url.searchParams.get('q') ?? '').trim()
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') ?? 20) || 20))

    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    if (query.length < 2) return NextResponse.json({ error: 'q must contain at least 2 characters' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'glossary.read')
    const supabase = await createClient()
    const { data: lexicalData, error: lexicalError } = await supabase
      .schema('governance')
      .rpc('search_governance_knowledge_lexical', {
        p_project_id: projectId,
        p_query: query,
        p_limit: limit,
      })
    if (lexicalError) throw new Error(`Governance knowledge lexical search failed: ${lexicalError.message}`)

    let semantic: SemanticMatch[] = []
    let semanticStatus: 'ENABLED' | 'NOT_CONFIGURED' | 'UNAVAILABLE' = 'ENABLED'
    try {
      semantic = await semanticSearch(supabase, {
        projectId,
        query,
        objectTypes: [
          'KNOWLEDGE_DOCUMENT',
          'KNOWLEDGE_REQUIREMENT',
          'CRITICAL_DATA_ELEMENT',
          'GLOSSARY_TERM',
          'POLICY',
        ],
        threshold: 0.35,
        limit,
      })
    } catch (error) {
      semanticStatus = error instanceof Error && error.name === 'EmbeddingProviderNotConfiguredError'
        ? 'NOT_CONFIGURED'
        : 'UNAVAILABLE'
      if (semanticStatus === 'UNAVAILABLE') console.error('Governance knowledge semantic search unavailable', error)
    }

    const lexical = (lexicalData ?? []) as LexicalKnowledgeResult[]
    const results = mergeKnowledge(lexical, semantic).slice(0, limit)
    return NextResponse.json({
      projectId,
      query,
      count: results.length,
      results,
      semantic: { status: semanticStatus, matches: semantic.length },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to search governance knowledge'
    const status = /not authorized|forbidden|capability/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
