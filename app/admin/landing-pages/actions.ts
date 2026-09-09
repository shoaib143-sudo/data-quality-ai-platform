'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/supabase/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPersonaSlug } from '@/lib/governance/personas'

export async function setLandingPageEnabled(formData: FormData) {
  const user = await requireUser()
  const organizationId = String(formData.get('organizationId') ?? '')
  const personaSlug = String(formData.get('personaSlug') ?? '')
  const enabled = String(formData.get('enabled') ?? '') === 'true'

  if (!organizationId || !isPersonaSlug(personaSlug)) throw new Error('Invalid landing page setting request.')

  const admin = createAdminClient()
  const membership = await admin.schema('app').from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .in('role', ['OWNER', 'ADMIN'])
    .maybeSingle()

  if (membership.error) throw new Error(`Unable to verify administrator access: ${membership.error.message}`)
  if (!membership.data) throw new Error('Administrator access is required.')

  const result = await admin.schema('governance').from('landing_page_settings').upsert({
    organization_id: organizationId,
    persona_slug: personaSlug,
    enabled,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }, { onConflict: 'organization_id,persona_slug' })

  if (result.error) throw new Error(`Unable to update landing page setting: ${result.error.message}`)

  revalidatePath('/admin/landing-pages')
  revalidatePath('/home')
  revalidatePath(`/home/${personaSlug}`)
}
