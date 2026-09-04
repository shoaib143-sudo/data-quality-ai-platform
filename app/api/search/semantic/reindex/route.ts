import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { reindexProjectSemanticObjects } from '@/lib/governance/semantic-indexer'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const user = await requireUser()
  const body = (await request.json().catch(() => null)) as { projectId?: string; concurrency?: number } | null
  const projectId = body?.projectId?.trim()

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: allowed, error: capabilityError } = await supabase
    .schema('governance')
    .rpc('has_project_capability', {
      p_project_id: projectId,
      p_user_id: user.id,
      p_capability: 'catalog.update',
    })

  if (capabilityError) {
    console.error('Unable to evaluate semantic indexing capability', capabilityError)
    return NextResponse.json({ error: 'Unable to verify project capability' }, { status: 500 })
  }
  if (!allowed) {
    return NextResponse.json({ error: 'catalog.update capability is required' }, { status: 403 })
  }

  try {
    const concurrency = typeof body?.concurrency === 'number' && Number.isFinite(body.concurrency)
      ? body.concurrency
      : undefined
    const result = await reindexProjectSemanticObjects(projectId, { concurrency })
    return NextResponse.json(result, { status: result.failed ? 207 : 200 })
  } catch (error) {
    if (error instanceof Error && error.name === 'EmbeddingProviderNotConfiguredError') {
      return NextResponse.json(
        {
          error: 'Semantic indexing is not configured',
          code: 'SEMANTIC_EMBEDDING_PROVIDER_NOT_CONFIGURED',
        },
        { status: 503 },
      )
    }
    console.error('Semantic reindex failed', error)
    return NextResponse.json({ error: 'Semantic reindex failed' }, { status: 500 })
  }
}
