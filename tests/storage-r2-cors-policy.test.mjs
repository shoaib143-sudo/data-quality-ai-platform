import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync(new URL('../infra/cloudflare/r2-cors-policy.json', import.meta.url), 'utf8'))

test('R2 browser CORS policy is explicit and least privilege', () => {
  assert.equal(Array.isArray(policy), true)
  assert.equal(policy.length, 1)
  const rule = policy[0]
  assert.equal(rule.AllowedOrigins.includes('*'), false)
  assert.equal(rule.AllowedOrigins.some(origin => { const url = new URL(origin); return url.protocol === 'https:' && url.hostname === 'data-quality-ai-platform.vercel.app' && url.port === '' && url.pathname === '/' && url.search === '' && url.hash === '' }), true)
  assert.deepEqual([...rule.AllowedMethods].sort(), ['GET', 'HEAD', 'PUT'])
  assert.deepEqual(rule.AllowedHeaders, ['Content-Type'])
  assert.equal(rule.ExposeHeaders.includes('ETag'), true)
  assert.equal(rule.ExposeHeaders.includes('Content-Length'), true)
  assert.equal(rule.MaxAgeSeconds, 3600)
})

test('R2 CORS origins are valid browser origins without paths or trailing slashes', () => {
  for (const origin of policy[0].AllowedOrigins) {
    const url = new URL(origin)
    assert.equal(url.protocol, 'https:')
    assert.equal(url.pathname, '/')
    assert.equal(url.search, '')
    assert.equal(url.hash, '')
    assert.equal(origin.endsWith('/'), false)
  }
})
