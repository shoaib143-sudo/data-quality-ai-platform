import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { resolveLandingAccess } from '@/lib/governance/landing-access'
import { sanitizeConversationOverride } from '@/lib/governance/conversation-policy'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const user = await requireApiUser()
    const context = await resolveLandingAccess(user.id)
    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').from('agent_conversation_overrides')
      .select('id,settings,updated_at')
      .eq('organization_id', context.organizationId)
      .eq('scope_type', 'USER')
      .eq('user_id', user.id)
      .eq('active', true)
      .is('project_id', null)
      .is('domain', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`Unable to load AI preferences: ${error.message}`)
    return NextResponse.json({ settings: sanitizeConversationOverride(data?.settings ?? {}), updatedAt: data?.updated_at ?? null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load AI preferences.' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireApiUser()
    const context = await resolveLandingAccess(user.id)
    const raw = await request.json().catch(() => null)
    const settings = sanitizeConversationOverride(raw)
    const admin = createAdminClient()

    const { data: existing, error: existingError } = await admin.schema('governance').from('agent_conversation_overrides')
      .select('id')
      .eq('organization_id', context.organizationId)
      .eq('scope_type', 'USER')
      .eq('user_id', user.id)
      .eq('active', true)
      .is('project_id', null)
      .is('domain', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingError) throw new Error(`Unable to resolve AI preferences: ${existingError.message}`)

    if (existing?.id) {
      const { error } = await admin.schema('governance').from('agent_conversation_overrides').update({
        settings,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
      if (error) throw new Error(`Unable to update AI preferences: ${error.message}`)
    } else {
      const { error } = await admin.schema('governance').from('agent_conversation_overrides').insert({
        organization_id: context.organizationId,
        scope_type: 'USER',
        persona_slug: context.persona,
        user_id: user.id,
        settings,
        created_by: user.id,
        updated_by: user.id,
      })
      if (error) throw new Error(`Unable to create AI preferences: ${error.message}`)
    }

    return NextResponse.json({ saved: true, settings })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save AI preferences.' }, { status: 500 })
  }
}
