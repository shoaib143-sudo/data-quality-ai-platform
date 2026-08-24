/**
 * Supabase environment configuration.
 *
 * Keep the NEXT_PUBLIC_* references explicit. Next.js statically inlines
 * NEXT_PUBLIC_* variables into browser bundles; dynamic access such as
 * process.env[name] is not reliably inlined for client code.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL')
  }

  if (!publishableKey) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  }

  return { url, publishableKey }
}
