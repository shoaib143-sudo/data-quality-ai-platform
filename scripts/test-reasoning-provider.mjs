import assert from 'node:assert/strict'

const originalFetch = globalThis.fetch
const originalEnv = {
  AI_MODEL_API_KEY: process.env.AI_MODEL_API_KEY,
  AI_MODEL_BASE_URL: process.env.AI_MODEL_BASE_URL,
  AI_MODEL_NAME: process.env.AI_MODEL_NAME,
  AI_REASONING_PROVIDER: process.env.AI_REASONING_PROVIDER,
}

try {
  process.env.AI_MODEL_API_KEY = 'test-key'
  process.env.AI_MODEL_BASE_URL = 'https://reasoning.example/v1/'
  process.env.AI_MODEL_NAME = 'test-model'
  process.env.AI_REASONING_PROVIDER = 'openai_compatible'

  let capturedUrl = null
  let capturedInit = null
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url)
    capturedInit = init
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"executive_summary":"grounded"}' } }],
      usage: {
        prompt_tokens: 17,
        completion_tokens: 9,
        total_tokens: 26,
      },
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-provider-observed-123',
      },
    })
  }

  const { getReasoningProvider } = await import('../lib/ai/reasoning-provider.ts')
  const provider = getReasoningProvider()
  assert.ok(provider)
  const result = await provider.generateJson({
    task: 'profiling_investigation',
    system: 'Use evidence only.',
    input: { observed: true },
  })

  assert.equal(capturedUrl, 'https://reasoning.example/v1/chat/completions')
  assert.equal(result.provider, 'openai_compatible')
  assert.equal(result.model, 'test-model')
  assert.deepEqual(result.result, { executive_summary: 'grounded' })
  assert.ok(Number.isInteger(result.latencyMs) && result.latencyMs >= 0)
  assert.deepEqual(result.usage, { inputTokens: 17, outputTokens: 9, totalTokens: 26 })
  assert.equal(result.providerRequestId, 'req-provider-observed-123')

  const request = JSON.parse(capturedInit.body)
  assert.equal(request.model, 'test-model')
  assert.equal(request.temperature, 0)
  assert.deepEqual(request.response_format, { type: 'json_object' })
  assert.equal(request.messages[0].role, 'system')
  assert.equal(request.messages[1].content, JSON.stringify({ observed: true }))

  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"executive_summary":"no-usage"}' } }],
    usage: {
      prompt_tokens: -1,
      completion_tokens: 1.5,
      total_tokens: 'unknown',
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })

  const resultWithoutObservedUsage = await provider.generateJson({
    task: 'general',
    system: 'Use evidence only.',
    input: { observed: false },
  })
  assert.equal(resultWithoutObservedUsage.usage, undefined)
  assert.equal(resultWithoutObservedUsage.providerRequestId, undefined)
  assert.ok(Number.isInteger(resultWithoutObservedUsage.latencyMs) && resultWithoutObservedUsage.latencyMs >= 0)

  process.env.AI_REASONING_PROVIDER = 'unknown-provider'
  assert.throws(() => getReasoningProvider(), /Unsupported AI reasoning provider/)

  delete process.env.AI_MODEL_API_KEY
  delete process.env.AI_REASONING_PROVIDER
  assert.equal(getReasoningProvider(), null)

  console.log('OpenAI-compatible ReasoningProvider behavior and provider-observed usage verified.')
} finally {
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
