import { redirect } from 'next/navigation'
import { createClient } from './server'

export type AuthenticatedUser = {
  id: string
  email?: string
}

/** Require an authenticated Supabase user on a Server Component/Server Action. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims?.sub) {
    redirect('/login')
  }

  return {
    id: String(data.claims.sub),
    email: typeof data.claims.email === 'string' ? data.claims.email : undefined,
  }
}
