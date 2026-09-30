import assert from 'node:assert/strict'
import './lib/register-typescript-resolution.mjs'
const { OpenAICompatibleReasoningProvider } = await import('../lib/ai/reasoning-provider.ts')
const { ResilientReasoningProvider } = await import('../lib/ai/provider-resilience.ts')
const request = { task: 'general', system: 'test', input: {} }
const provider = new OpenAICompatibleReasoningProvider({ apiKey: 'synthetic', baseUrl: 'https://synthetic.invalid', model: 'test' })
const originalFetch = globalThis.fetch
let calls = 0
try {
  globalThis.fetch = async () => { calls++; throw new Error('must not call') }
  const stopped = AbortSignal.abort(new DOMException('stopped', 'AbortError'))
  await assert.rejects(provider.generateJson({ ...request, signal: stopped }), { name: 'AbortError' })
  assert.equal(calls, 0)

  const controller = new AbortController()
  let entered
  const started = new Promise(resolve => { entered = resolve })
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    assert.equal(options.signal, controller.signal)
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    entered()
  })
  const pending = provider.generateJson({ ...request, signal: controller.signal })
  await started
  controller.abort(new DOMException('deadline', 'TimeoutError'))
  await assert.rejects(pending, { name: 'TimeoutError' })

  const profile = { projectId: 'p', aiSystemVersionId: 'primary', fallbackGroup: 'g', productionEligible: true, automaticFallbackEnabled: true, dataResidencyRegions: ['EU'], securityTier: 1, governanceTier: 1 }
  let fallbacks = 0
  const candidate = { provider: { id: 'fallback', async generateJson() { fallbacks++; return { provider: 'fallback', model: 'test', result: {}, latencyMs: 0 } } }, modelName: 'test', aiSystemVersionId: 'fallback', profile: { ...profile, aiSystemVersionId: 'fallback' } }
  const cancelled = new AbortController()
  const resilient = new ResilientReasoningProvider({ provider: { id: 'primary', async generateJson() { cancelled.abort(new DOMException('deadline', 'TimeoutError')); throw new TypeError('network') } }, modelName: 'test', aiSystemVersionId: 'primary', profile }, [candidate])
  await assert.rejects(resilient.generateJson({ ...request, signal: cancelled.signal }), { name: 'TimeoutError' })
  assert.equal(fallbacks, 0)
  const healthy = new ResilientReasoningProvider({ provider: { id: 'primary', async generateJson() { throw new TypeError('network') } }, modelName: 'test', aiSystemVersionId: 'primary', profile }, [candidate])
  assert.equal((await healthy.generateJson(request)).resilience.attempts, 2)
  assert.equal(fallbacks, 1)
} finally { globalThis.fetch = originalFetch }
console.log('Reasoning cancellation behavior passed')
