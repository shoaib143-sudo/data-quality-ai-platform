import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseEnv } from './env'

const protectedPrefixes = [
  '/dashboard',
  '/datasets',
  '/profiling',
  '/data-quality',
  '/profile',
  '/settings',
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

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'))
}

export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const protectedPath = isProtectedPath(pathname)
  const authPage = isAuthPage(pathname)

  // Anonymous public requests do not need a remote Supabase claims lookup.
  // Protected routes still fail closed through getClaims(), and auth pages
  // with a Supabase session cookie still verify claims before redirecting.
  if (!protectedPath && (!authPage || !hasSupabaseAuthCookie(request))) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })
  const { url, publishableKey } = getSupabaseEnv()

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set({ name, value, ...options }))
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  const { data, error } = await supabase.auth.getClaims()
  const authenticated = !error && Boolean(data?.claims?.sub)

  if (protectedPath && !authenticated) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.search = ''
    redirectUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(redirectUrl)
  }

  if (authenticated && authPage) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  return response
}
