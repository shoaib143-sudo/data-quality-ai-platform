import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(new URL('../.github/workflows/storage-r2-assurance.yml', import.meta.url), 'utf8')

test('certification never prints authorization material directly', () => {
  assert.doesNotMatch(workflow, /echo\s+[^\n]*CRON_SECRET|printf\s+[^\n]*CRON_SECRET/)
  assert.match(workflow, /unsafe=\["error","secret","token","credential"\]/)
})
