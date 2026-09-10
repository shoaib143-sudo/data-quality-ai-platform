import { createClient } from '@/lib/supabase/server'
import { AuthorizationError } from '@/lib/auth/authorize'

export type ApiAuthenticatedUser = {
  id: string
  email?: string
}

/** Require authentication without invoking Next.js navigation redirects. */
export async function requireApiUser(): Promise<ApiAuthenticatedUser> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user?.id) {
    throw new AuthorizationError('Authentication required.', 401)
  }

  return {
    id: String(data.user.id),
    email: typeof data.user.email === 'string' ? data.user.email : undefined,
  }
}
