import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))
  if (!code) return NextResponse.redirect(new URL(`/login?error=missing_code&next=${encodeURIComponent(next)}`, url.origin))

  const supabase = await createClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) return NextResponse.redirect(new URL(`/login?error=auth_callback&next=${encodeURIComponent(next)}`, url.origin))

  const { data: userResult } = await supabase.auth.getUser()
  const user = userResult.user
  if (user?.id && user.email) {
    const provider = String(user.app_metadata?.provider ?? '')
    const providers = Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers.map(String) : []
    const isSso = provider.startsWith('sso') || providers.some((item) => item.startsWith('sso'))
    if (isSso) {
      const domain = user.email.split('@').at(-1)?.toLowerCase() ?? ''
      if (domain) {
        const admin = createAdminClient()
        const { data: mapping } = await admin.schema('governance').from('sso_domains')
          .select('organization_id,default_role,auto_join,enabled')
          .eq('domain', domain)
          .eq('enabled', true)
          .maybeSingle()
        if (mapping?.auto_join) {
          const { data: existing } = await admin.schema('app').from('organization_members')
            .select('role').eq('organization_id', mapping.organization_id).eq('user_id', user.id).maybeSingle()
          if (!existing) {
            const { error: membershipError } = await admin.schema('app').from('organization_members').insert({
              organization_id: mapping.organization_id,
              user_id: user.id,
              role: mapping.default_role,
            })
            if (!membershipError) {
              await writeGovernanceAudit({
                actorUserId: user.id,
                eventType: 'SSO_MEMBER_AUTO_JOINED',
                entityType: 'ORGANIZATION',
                entityId: mapping.organization_id,
                metadata: { domain, role: mapping.default_role, authentication: 'SAML_SSO' },
              })
            }
          }
        }
      }
    }
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
