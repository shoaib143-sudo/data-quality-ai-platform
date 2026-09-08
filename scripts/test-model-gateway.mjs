import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const originalFetch = globalThis.fetch
const keys = [
  'AI_MODEL_API_KEY',
  'AI_MODEL_BASE_URL',
  'AI_MODEL_NAME',
  'AI_REASONING_PROVIDER',
  'AI_MODEL_NAME_PROFILING_INVESTIGATION',
  'AI_REASONING_PROVIDER_PROFILING_INVESTIGATION',
]
const originalEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datanexus-model-gateway-'))

function transpile(sourcePath) {
  return ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

try {
  const providerSource = transpile('lib/ai/reasoning-provider.ts')
  const gatewaySource = transpile('lib/ai/model-gateway.ts')
    .replace("from './reasoning-provider'", "from './reasoning-provider.mjs'")
  fs.writeFileSync(path.join(tempDir, 'reasoning-provider.mjs'), providerSource)
  fs.writeFileSync(path.join(tempDir, 'model-gateway.mjs'), gatewaySource)

  process.env.AI_MODEL_API_KEY = 'test-key'
  process.env.AI_MODEL_BASE_URL = 'https://gateway.example/v1/'
  process.env.AI_MODEL_NAME = 'global-model'
  process.env.AI_REASONING_PROVIDER = 'openai_compatible'
  process.env.AI_MODEL_NAME_PROFILING_INVESTIGATION = 'profiling-model'

  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body)
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ selected_model: request.model }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const { getModelGateway } = await import(pathToFileURL(path.join(tempDir, 'model-gateway.mjs')).href)
  const gateway = getModelGateway()

  const profilingProvider = gateway.reasoning({ task: 'profiling_investigation', sensitivity: 'INTERNAL', risk: 'MEDIUM' })
  assert.ok(profilingProvider)
  const profiling = await profilingProvider.generateJson({ task: 'profiling_investigation', system: 'test', input: {} })
  assert.equal(profiling.model, 'profiling-model')
  assert.deepEqual(profiling.result, { selected_model: 'profiling-model' })

  const generalProvider = gateway.reasoning({ task: 'general' })
  assert.ok(generalProvider)
  const general = await generalProvider.generateJson({ task: 'general', system: 'test', input: {} })
  assert.equal(general.model, 'global-model')
  assert.deepEqual(general.result, { selected_model: 'global-model' })

  process.env.AI_REASONING_PROVIDER_PROFILING_INVESTIGATION = 'unsupported-provider'
  assert.throws(() => gateway.reasoning({ task: 'profiling_investigation' }), /Unsupported AI reasoning provider/)

  delete process.env.AI_REASONING_PROVIDER_PROFILING_INVESTIGATION
  delete process.env.AI_MODEL_API_KEY
  assert.equal(gateway.reasoning({ task: 'profiling_investigation' }), null)

  console.log('ADR-006 Model Gateway behavior verified.')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
