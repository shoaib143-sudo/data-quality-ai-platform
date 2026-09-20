import { NextResponse } from 'next/server'

import { requireApiUser } from '@/lib/auth/require-api-user'
import {
  authorizeProject,
  authorizationErrorResponse,
  hasProjectCapability,
} from '@/lib/auth/authorize'
import { loadDatasetRelationshipIntelligence } from '@/lib/governance/dataset-relationship-intelligence'

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = (url.searchParams.get('projectId') ?? '').trim()
    const datasetId = (url.searchParams.get('datasetId') ?? '').trim()
    const requestLineage = url.searchParams.get('lineage') !== 'false'

    if (!projectId || !datasetId) {
      return NextResponse.json({ error: 'projectId and datasetId are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'catalog.read')
    const lineageAllowed = requestLineage
      ? await hasProjectCapability(user.id, projectId, 'lineage.read')
      : false

    const result = await loadDatasetRelationshipIntelligence({
      projectId,
      datasetId,
      includeAuthoritativeLineage: lineageAllowed,
    })

    return NextResponse.json({
      ...result,
      requestedLineage: requestLineage,
      lineageAuthorized: lineageAllowed,
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    const message = error instanceof Error ? error.message : 'Unable to load dataset relationships.'
    return NextResponse.json(
      { error: message },
      { status: /required|not found in the requested project/i.test(message) ? 400 : 500 },
    )
  }
}
