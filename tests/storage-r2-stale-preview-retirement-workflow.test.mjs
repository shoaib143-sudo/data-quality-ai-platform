import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url), 'utf8')

test('stale R2 preview retirement check is manual and isolated from production certification', () => {
  assert.match(workflow, /stale-preview-retirement-check/)
  assert.match(workflow, /stale_preview_url/)
  assert.match(workflow, /inputs\.operation == 'stale-preview-retirement-check'/)
  assert.match(workflow, /inputs\.operation == 'production-readiness' \|\| inputs\.operation == 'production-certify'/)
})

test('stale preview verification is constrained to non-production Vercel hostnames', () => {
  assert.match(workflow, /hostname\.endsWith\('\.vercel\.app'\)/)
  assert.match(workflow, /hostname === 'data-quality-ai-platform\.vercel\.app'/)
  assert.match(workflow, /url\.protocol !== 'https:'/)
})

test('closure evidence requires unauthenticated GET and POST to fail closed', () => {
  assert.match(workflow, /for method in GET POST/)
  assert.match(workflow, /api\/internal\/storage\/r2-smoke/)
  assert.match(workflow, /code" != "401"/)
  assert.match(workflow, /code" != "404"/)
  assert.doesNotMatch(workflow, /secrets\.CRON_SECRET/)
})
