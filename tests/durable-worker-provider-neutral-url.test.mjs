import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(new URL('../supabase/migrations/20260919121000_provider_neutral_durable_worker_url.sql', import.meta.url), 'utf8')

test('durable worker destination is Vault-backed and provider-neutral', () => {
  assert.match(migration, /DGP_DURABLE_WORKER_SECRET/)
  assert.match(migration, /DGP_DURABLE_WORKER_URL/)
  assert.match(migration, /url := worker_url/)
  assert.match(migration, /\^https:\/\//)
  assert.match(migration, /\/api\/jobs\/worker\$/)
  assert.doesNotMatch(migration, /data-quality-ai-platform\.vercel\.app/)
})

test('provider-neutral worker migration preserves the single scheduler authority', () => {
  assert.match(migration, /create or replace function orchestration\.kick_durable_worker/)
  assert.match(migration, /security definer/)
  assert.match(migration, /vault\.decrypted_secrets/)
  assert.match(migration, /net\.http_post/)
  assert.match(migration, /'Authorization', 'Bearer ' \|\| worker_secret/)
  assert.doesNotMatch(migration, /cron\.schedule/)
})
