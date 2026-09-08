import assert from 'node:assert/strict'

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

try {
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

  const { getModelGateway } = await import('../lib/ai/model-gateway.ts')
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
  assert.throws(
    () => gateway.reasoning({ task: 'profiling_investigation' }),
    /Unsupported AI reasoning provider/,
  )

  delete process.env.AI_REASONING_PROVIDER_PROFILING_INVESTIGATION
  delete process.env.AI_MODEL_API_KEY
  assert.equal(gateway.reasoning({ task: 'profiling_investigation' }), null)

  console.log('ADR-006 Model Gateway behavior verified.')
} finally {
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
