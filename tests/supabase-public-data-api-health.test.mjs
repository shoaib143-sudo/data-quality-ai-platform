import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  probeSupabasePublicDataApi,
} from '../lib/supabase/public-data-api-health.ts'

test('publishable-key health probe targets a read-only Data API resource', async () => {
  let seenUrl = ''
  let seenInit

  const result = await probeSupabasePublicDataApi({
    url: 'https://example.supabase.co/',
    publishableKey: 'sb_publishable_example',
    fetchImpl: async (url, init) => {
      seenUrl = String(url)
      seenInit = init
      return new Response('[]', { status: 200 })
    },
  })

  assert.deepEqual(result, { ok: true, httpStatus: 200 })
  assert.equal(
    seenUrl,
    'https://example.supabase.co/rest/v1/rpc/public_data_api_health',
  )
  assert.equal(seenInit.method, 'POST')
  assert.equal(seenInit.cache, 'no-store')
  assert.equal(seenInit.headers.apikey, 'sb_publishable_example')
  assert.equal(seenInit.headers.authorization, 'Bearer sb_publishable_example')
  assert.equal(seenInit.headers['content-type'], 'application/json')
  assert.equal(seenInit.body, '{}')
  assert.ok(seenInit.signal instanceof AbortSignal)
  assert.notEqual(seenUrl, 'https://example.supabase.co/rest/v1/')
})

test('non-2xx Supabase responses fail closed with sanitized status only', async () => {
  const result = await probeSupabasePublicDataApi({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_example',
    fetchImpl: async () => new Response(
      JSON.stringify({ message: 'sensitive upstream detail' }),
      { status: 401 },
    ),
  })

  assert.deepEqual(result, { ok: false, httpStatus: 401 })
  assert.equal('body' in result, false)
  assert.equal('message' in result, false)
})

test('network failures fail closed without fabricating an HTTP status', async () => {
  const result = await probeSupabasePublicDataApi({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_example',
    fetchImpl: async () => {
      throw new Error('network unavailable')
    },
  })

  assert.deepEqual(result, { ok: false, httpStatus: null })
})

test('timeout aborts a hung upstream probe and fails closed', async () => {
  const started = Date.now()
  const result = await probeSupabasePublicDataApi({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_example',
    timeoutMs: 250,
    fetchImpl: async (_url, init) => await new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }),
  })

  assert.deepEqual(result, { ok: false, httpStatus: null })
  assert.ok(Date.now() - started >= 200)
  assert.ok(Date.now() - started < 2_000)
})


test('database migration exposes only a constant zero-data health RPC', () => {
  const migration = readFileSync(
    'supabase/migrations/20260924055500_public_data_api_health_probe.sql',
    'utf8',
  )

  assert.match(migration, /create or replace function public\.public_data_api_health\(\)/i)
  assert.match(migration, /returns boolean/i)
  assert.match(migration, /language sql/i)
  assert.match(migration, /immutable/i)
  assert.match(migration, /set search_path = pg_catalog/i)
  assert.match(migration, /select true/i)
  assert.match(migration, /revoke all on function public\.public_data_api_health\(\) from public/i)
  assert.match(migration, /grant execute on function public\.public_data_api_health\(\) to anon, authenticated, service_role/i)
  assert.doesNotMatch(migration, /security definer/i)
  assert.doesNotMatch(migration, /\bfrom\s+(?:app|catalog|agent|profiling|governance|storage)\./i)
  assert.doesNotMatch(migration, /\b(insert|update|delete|truncate|drop)\b/i)
})
