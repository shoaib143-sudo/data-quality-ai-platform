import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseEnv } from './env'

const protectedPrefixes = [
  '/dashboard',
  '/datasets',
  '/profiling',
  '/data-quality',
  '/observability',
  '/agents',
]

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

function isAuthPage(pathname: string) {
  return pathname === '/login' || pathname === '/signup'
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, publishableKey } = getSupabaseEnv()

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value, options))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // getUser() validates the session against Supabase Auth and refreshes the
  // session when necessary. This keeps the SSR client and its RLS role aligned
  // with the authenticated browser session instead of relying only on a local
  // claims check.
  const { data, error } = await supabase.auth.getUser()
  const authenticated = !error && Boolean(data?.user?.id)
  const { pathname, search } = request.nextUrl

  if (isProtectedPath(pathname) && !authenticated) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.search = ''
    redirectUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(redirectUrl)
  }

  if (authenticated && isAuthPage(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  return response
}
