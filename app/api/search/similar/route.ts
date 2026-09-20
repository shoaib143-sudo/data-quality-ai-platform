import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import {
  findSimilarGovernanceObjects,
  normalizeSimilarityTargetTypes,
  similarityCapability,
  type GovernedSimilarityType,
} from '@/lib/governance/governed-similarity'

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = (url.searchParams.get('projectId') ?? '').trim()
    const sourceType = (url.searchParams.get('sourceType') ?? '').trim().toUpperCase() as GovernedSimilarityType
    const sourceKey = (url.searchParams.get('sourceKey') ?? '').trim()
    const targetTypesRaw = url.searchParams.get('targetTypes') ?? undefined
    const threshold = Number(url.searchParams.get('threshold') ?? 0.35)
    const limit = Number(url.searchParams.get('limit') ?? 20)

    if (!projectId || !sourceType || !sourceKey) {
      return NextResponse.json(
        { error: 'projectId, sourceType and sourceKey are required.' },
        { status: 400 },
      )
    }

    const targetTypes = normalizeSimilarityTargetTypes(sourceType, targetTypesRaw)
    const capabilities = new Set<string>([
      similarityCapability(sourceType),
      ...targetTypes.map(similarityCapability),
    ])
    for (const capability of capabilities) {
      await authorizeProject(user.id, projectId, capability)
    }

    const result = await findSimilarGovernanceObjects({
      projectId,
      sourceType,
      sourceKey,
      targetTypes,
      threshold: Number.isFinite(threshold) ? threshold : undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
    })

    return NextResponse.json({
      ...result,
      count: result.matches.length,
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })

    const message = error instanceof Error ? error.message : 'Unable to find similar governance objects.'
    const status = /required|Unsupported similarity object type|not indexed|no searchable content/.test(message)
      ? 400
      : error instanceof Error && error.name === 'EmbeddingProviderNotConfiguredError'
        ? 503
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
