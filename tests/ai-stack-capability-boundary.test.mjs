import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('AI safety boundary is provider-neutral and fail closed', () => {
  const source = read('lib/orchestration/ai-safety-boundary.ts')
  assert.match(source, /AiSafetyProvider/)
  assert.match(source, /'ALLOW' \| 'DENY' \| 'REVIEW'/)
  assert.match(source, /decision !== 'ALLOW'/)
  assert.match(source, /ALLOW requires evidence/)
})

test('stack assessment rejects parallel authority planes', () => {
  const source = read('Admin & Major Discussions/2026-10-04-ai-app-stack-capability-assessment.md')
  assert.match(source, /One control plane/)
  assert.match(source, /never parallel orchestrators/)
  assert.match(source, /measured capability gap/)
})
