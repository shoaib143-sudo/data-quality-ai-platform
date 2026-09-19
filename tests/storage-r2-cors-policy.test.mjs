import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const policy = JSON.parse(fs.readFileSync(new URL('../infra/cloudflare/r2-cors-policy.json', import.meta.url), 'utf8'))

test('R2 browser CORS policy is explicit and least privilege', () => {
  assert.equal(Array.isArray(policy), true)
  assert.equal(policy.length, 1)
  const rule = policy[0]
  assert.equal(rule.AllowedOrigins.includes('*'), false)
  assert.deepEqual(rule.AllowedOrigins, ['https://data-quality-ai-platform.vercel.app'])
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

test('R2 static policy does not pin ephemeral Vercel preview deployments', () => {
  assert.equal(policy[0].AllowedOrigins.some(origin => origin.includes('-git-')), false)
})
