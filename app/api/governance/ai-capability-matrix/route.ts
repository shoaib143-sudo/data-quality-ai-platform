import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const projectId = new URL(request.url).searchParams.get('projectId')?.trim() ?? ''
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'catalog.read')

    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('governance')
      .rpc('generate_ai_capability_matrix', { p_project_id: projectId })

    if (error) throw new Error(`Unable to generate AI capability matrix: ${error.message}`)
    const matrix = Array.isArray(data) ? data : []

    return NextResponse.json({
      projectId,
      capability: 'catalog.read',
      capabilityCount: matrix.length,
      generatedAt: new Date().toISOString(),
      matrix,
    })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to generate AI capability matrix.' }, { status: 500 })
  }
}
