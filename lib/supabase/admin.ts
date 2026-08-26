import { createClient } from '@supabase/supabase-js'
import { getSupabaseEnv } from './env'

export function createAdminClient() {
  const { url } = getSupabaseEnv()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  const payload = JSON.parse(
    Buffer.from(
      serviceRoleKey.split(".")[1],
      "base64"
    ).toString()
  )

  console.log("ADMIN_CLIENT_DEBUG", {
    url,
    role: payload.role,
    ref: payload.ref,
  })

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}