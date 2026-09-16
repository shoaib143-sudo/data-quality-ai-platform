import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../lib/supabase/proxy.ts', import.meta.url), 'utf8')

test('anonymous public routes bypass the remote claims lookup', () => {
  assert.match(source, /function hasSupabaseAuthCookie\(request: NextRequest\)/)
  assert.match(source, /name\.startsWith\('sb-'\) && name\.includes\('-auth-token'\)/)
  assert.match(
    source,
    /if \(!protectedPath && \(!authPage \|\| !hasSupabaseAuthCookie\(request\)\)\) \{\s*return NextResponse\.next\(\{ request \}\)\s*\}/s,
  )
})

test('protected routes still authenticate with Supabase claims', () => {
  const fastPathIndex = source.indexOf('if (!protectedPath && (!authPage || !hasSupabaseAuthCookie(request)))')
  const claimsIndex = source.indexOf('await supabase.auth.getClaims()')
  const protectedRedirectIndex = source.indexOf('if (protectedPath && !authenticated)')

  assert.ok(fastPathIndex >= 0)
  assert.ok(claimsIndex > fastPathIndex)
  assert.ok(protectedRedirectIndex > claimsIndex)
})

test('authenticated auth pages retain verified redirect behavior', () => {
  assert.match(source, /if \(authenticated && authPage\)/)
  assert.match(source, /redirectUrl\.pathname = '\/dashboard'/)
})
