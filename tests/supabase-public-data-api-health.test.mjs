import assert from 'node:assert/strict'
import test from 'node:test'
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
    'https://example.supabase.co/rest/v1/agent_definitions?select=id&limit=0',
  )
  assert.equal(seenInit.method, 'GET')
  assert.equal(seenInit.cache, 'no-store')
  assert.equal(seenInit.headers.apikey, 'sb_publishable_example')
  assert.equal(seenInit.headers.authorization, 'Bearer sb_publishable_example')
  assert.equal(seenInit.headers['accept-profile'], 'agent')
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
