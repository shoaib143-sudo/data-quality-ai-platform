import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const configUrl = pathToFileURL(resolve('next.config.mjs')).href

function readOutputMode({ vercel }) {
  const env = { ...process.env }
  if (vercel) env.VERCEL = '1'
  else delete env.VERCEL

  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const { default: config } = await import(${JSON.stringify(configUrl)}); console.log(JSON.stringify({ output: config.output ?? null }))`,
    ],
    { env, encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout.trim()).output
}

test('Vercel builds do not request standalone output', () => {
  assert.equal(readOutputMode({ vercel: true }), null)
})

test('non-Vercel builds retain standalone output', () => {
  assert.equal(readOutputMode({ vercel: false }), 'standalone')
})
