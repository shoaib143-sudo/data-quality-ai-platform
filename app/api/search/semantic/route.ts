import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { semanticSearch } from '@/lib/governance/semantic-search'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  await requireUser()
  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? '').trim()
  const projectId = (url.searchParams.get('projectId') ?? '').trim()
  const types = (url.searchParams.get('types') ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
  const requestedLimit = Number(url.searchParams.get('limit') ?? 25)
  const requestedThreshold = Number(url.searchParams.get('threshold') ?? 0.35)

  if (query.length < 2) {
    return NextResponse.json({ query, projectId, count: 0, results: [] })
  }
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const results = await semanticSearch(supabase, {
      projectId,
      query,
      objectTypes: types.length ? types : null,
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 25,
      threshold: Number.isFinite(requestedThreshold) ? requestedThreshold : 0.35,
    })

    return NextResponse.json({ query, projectId, count: results.length, results })
  } catch (error) {
    if (error instanceof Error && error.name === 'EmbeddingProviderNotConfiguredError') {
      return NextResponse.json(
        {
          error: 'Semantic search is not configured',
          code: 'SEMANTIC_EMBEDDING_PROVIDER_NOT_CONFIGURED',
        },
        { status: 503 },
      )
    }

    console.error('Semantic search failed', error)
    return NextResponse.json({ error: 'Semantic search failed' }, { status: 500 })
  }
}
