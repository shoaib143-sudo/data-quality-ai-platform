import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizationErrorResponse } from '@/lib/auth/authorize'
import { resolveProjectConversationPolicy } from '@/lib/governance/conversation-policy'

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')?.trim() ?? ''
    const domain = url.searchParams.get('domain')?.trim() || null
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    const context = await resolveProjectConversationPolicy({
      userId: user.id,
      projectId,
      requestedDomain: domain,
    })

    return NextResponse.json({
      projectId: context.projectId,
      appliedDomain: context.appliedDomain,
      availableDomains: context.availableDomains,
      settings: context.settings,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const authorization = authorizationErrorResponse(error)
    if (authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to resolve conversational defaults.' }, { status: 500 })
  }
}
