import assert from 'node:assert/strict'
import { ReasoningProviderHttpError } from '../lib/ai/reasoning-provider.ts'
import {
  ResilientReasoningProvider,
  isAutomaticFallbackEligible,
} from '../lib/ai/provider-resilience.ts'

function profile(overrides = {}) {
  return {
    projectId: 'project-1',
    aiSystemVersionId: 'version-primary',
    fallbackGroup: 'prod-governance',
    productionEligible: true,
    automaticFallbackEnabled: true,
    dataResidencyRegions: ['SG','AU'],
    securityTier: 3,
    governanceTier: 3,
    ...overrides,
  }
}

assert.equal(isAutomaticFallbackEligible(
  profile(),
  profile({ aiSystemVersionId: 'version-fallback', dataResidencyRegions: ['SG'], securityTier: 4, governanceTier: 4 }),
), true)

assert.equal(isAutomaticFallbackEligible(
  profile(),
  profile({ aiSystemVersionId: 'version-fallback', fallbackGroup: 'different' }),
), false)

assert.equal(isAutomaticFallbackEligible(
  profile(),
  profile({ aiSystemVersionId: 'version-fallback', dataResidencyRegions: ['US'] }),
), false)

assert.equal(isAutomaticFallbackEligible(
  profile(),
  profile({ aiSystemVersionId: 'version-fallback', securityTier: 2 }),
), false)

assert.equal(isAutomaticFallbackEligible(
  profile(),
  profile({ aiSystemVersionId: 'version-fallback', governanceTier: 2 }),
), false)

{
  let primaryCalls = 0
  let fallbackCalls = 0
  const provider = new ResilientReasoningProvider({
    provider: {
      id: 'primary',
      async generateJson() {
        primaryCalls += 1
        throw new ReasoningProviderHttpError(503, 'request-primary')
      },
    },
    modelName: 'primary-model',
    aiSystemVersionId: 'version-primary',
    profile: profile(),
  }, [{
    provider: {
      id: 'fallback',
      async generateJson() {
        fallbackCalls += 1
        return {
          provider: 'fallback',
          model: 'fallback-model',
          result: { ok: true },
          latencyMs: 10,
        }
      },
    },
    modelName: 'fallback-model',
    aiSystemVersionId: 'version-fallback',
    profile: profile({
      aiSystemVersionId: 'version-fallback',
      dataResidencyRegions: ['SG'],
      securityTier: 4,
      governanceTier: 4,
    }),
  }])

  const result = await provider.generateJson({ task: 'general', system: 'x', input: {} })
  assert.equal(primaryCalls, 1)
  assert.equal(fallbackCalls, 1)
  assert.equal(result.provider, 'fallback')
  assert.deepEqual(result.resilience, {
    requestedProvider: 'primary',
    requestedModel: 'primary-model',
    actualProvider: 'fallback',
    actualModel: 'fallback-model',
    fallbackApplied: true,
    fallbackReason: 'HTTP_503',
    attempts: 2,
  })
}

{
  let fallbackCalls = 0
  const provider = new ResilientReasoningProvider({
    provider: {
      id: 'primary',
      async generateJson() { throw new ReasoningProviderHttpError(400) },
    },
    modelName: 'primary-model',
    aiSystemVersionId: 'version-primary',
    profile: profile(),
  }, [{
    provider: {
      id: 'fallback',
      async generateJson() {
        fallbackCalls += 1
        throw new Error('must not run')
      },
    },
    modelName: 'fallback-model',
    aiSystemVersionId: 'version-fallback',
    profile: profile({ aiSystemVersionId: 'version-fallback' }),
  }])

  await assert.rejects(
    provider.generateJson({ task: 'general', system: 'x', input: {} }),
    error => error instanceof ReasoningProviderHttpError && error.status === 400,
  )
  assert.equal(fallbackCalls, 0)
}

{
  let fallbackCalls = 0
  const provider = new ResilientReasoningProvider({
    provider: {
      id: 'primary',
      async generateJson() { throw new ReasoningProviderHttpError(503) },
    },
    modelName: 'primary-model',
    aiSystemVersionId: 'version-primary',
    profile: profile(),
  }, [{
    provider: {
      id: 'fallback',
      async generateJson() {
        fallbackCalls += 1
        throw new Error('must not run')
      },
    },
    modelName: 'fallback-model',
    aiSystemVersionId: 'version-fallback',
    profile: profile({
      aiSystemVersionId: 'version-fallback',
      dataResidencyRegions: ['US'],
    }),
  }])

  await assert.rejects(provider.generateJson({ task: 'general', system: 'x', input: {} }), /503/)
  assert.equal(fallbackCalls, 0)
}

console.log('Runtime v2 governed provider resilience behavior verified.')
