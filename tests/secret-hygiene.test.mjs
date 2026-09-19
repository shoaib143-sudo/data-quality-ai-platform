import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { verifySecretHygiene } from '../scripts/verify-secret-hygiene.mjs'

async function fixture(files, callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'secret-hygiene-'))
  try {
    for (const [name, contents] of Object.entries(files)) {
      const target = path.join(root, name)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, contents)
    }
    await callback(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('rejects sensitive NEXT_PUBLIC variables', async () => {
  await fixture({ 'a.ts': "const x = process.env.NEXT_PUBLIC_API_SECRET\n" }, async root => {
    await assert.rejects(verifySecretHygiene({ roots: [root] }), /Secret hygiene failed/)
  })
})

test('rejects server secrets referenced by client components', async () => {
  await fixture({ 'a.tsx': "'use client'\nconst x = process.env.SUPABASE_SERVICE_ROLE_KEY\n" }, async root => {
    await assert.rejects(verifySecretHygiene({ roots: [root] }), /Secret hygiene failed/)
  })
})

test('rejects sensitive environment values written directly to console', async () => {
  await fixture({ 'a.ts': "console.log(process.env.CRON_SECRET)\n" }, async root => {
    await assert.rejects(verifySecretHygiene({ roots: [root] }), /Secret hygiene failed/)
  })
})

test('accepts server-only sensitive reads without logging', async () => {
  await fixture({ 'a.ts': "const secret = process.env.CRON_SECRET\nvoid secret\n" }, async root => {
    const result = await verifySecretHygiene({ roots: [root] })
    assert.deepEqual(result.violations, [])
  })
})
