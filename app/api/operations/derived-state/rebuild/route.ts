import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createClient } from '@/lib/supabase/server'
import { rebuildProjectDerivedStateWithRuntime } from '@/lib/data-plane/derived-state-rebuild-runtime'

export async function POST(request: Request) {
  const user = await requireUser()
  const body = (await request.json().catch(() => null)) as {
    projectId?: string
    reason?: string
    targets?: unknown
    semanticConcurrency?: number
  } | null

  const projectId = body?.projectId?.trim() ?? ''
  const reason = body?.reason?.trim() ?? ''
  if (!projectId || reason.length < 8) {
    return NextResponse.json(
      { error: 'projectId and a rebuild reason of at least 8 characters are required.' },
      { status: 400 },
    )
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
    console.error('Unable to evaluate derived-state rebuild capability', capabilityError)
    return NextResponse.json({ error: 'Unable to verify project capability' }, { status: 500 })
  }
  if (!allowed) {
    return NextResponse.json({ error: 'catalog.update capability is required' }, { status: 403 })
  }

  try {
    const result = await rebuildProjectDerivedStateWithRuntime({
      projectId,
      reason,
      actorUserId: user.id,
      targets: body?.targets,
      semanticConcurrency: typeof body?.semanticConcurrency === 'number'
        ? body.semanticConcurrency
        : undefined,
    })

    return NextResponse.json(result, { status: result.status === 'COMPLETED' ? 200 : 207 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to rebuild derived state.'
    const status = /required|Unsupported derived-state rebuild target|At least one/.test(message) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
