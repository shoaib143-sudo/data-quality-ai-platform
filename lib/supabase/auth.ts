import { redirect } from 'next/navigation'
import { createClient } from './server'

export type AuthenticatedUser = {
  id: string
  email?: string
}

/** Require an authenticated Supabase user on a Server Component/Server Action. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user?.id) {
    redirect('/login')
  }

  return {
    id: String(data.user.id),
    email: typeof data.user.email === 'string' ? data.user.email : undefined,
  }
}
