import assert from 'node:assert/strict'
import test from 'node:test'
import { mandatoryAiGovernanceCapabilities, missingAiCapabilityEvidence, validateAiCapabilityRegistry } from '../lib/orchestration/ai-governance-capabilities.ts'

test('mandatory AI capability inventory is structurally valid and unique', () => {
  assert.deepEqual(validateAiCapabilityRegistry(mandatoryAiGovernanceCapabilities), [])
  const keys = mandatoryAiGovernanceCapabilities.map(item => item.capabilityKey)
  assert.equal(new Set(keys).size, keys.length)
  assert.ok(mandatoryAiGovernanceCapabilities.length >= 19)
  assert.ok(mandatoryAiGovernanceCapabilities.every(item => item.mandatoryForE2E === true))
})

test('inventory covers critical AI execution, retrieval, evaluation, recovery and audit categories', () => {
  const categories = new Set(mandatoryAiGovernanceCapabilities.map(item => item.category))
  for (const category of ['AGENT_EXECUTION', 'DELEGATION', 'RAG', 'GROUNDING', 'MODEL_ROUTING', 'PROVIDER_FALLBACK', 'AI_EVALUATION', 'RED_TEAM', 'RECOVERY', 'OBSERVABILITY', 'AUDIT']) {
    assert.equal(categories.has(category), true, `missing ${category}`)
  }
})

test('missing evidence is reported fail closed for certification consumers', () => {
  const rag = mandatoryAiGovernanceCapabilities.find(item => item.capabilityKey === 'ai.rag.grounded')
  assert.ok(rag)
  assert.deepEqual(missingAiCapabilityEvidence(rag, ['context_refs']), ['grounded_answer'])
  assert.deepEqual(missingAiCapabilityEvidence(rag, ['context_refs', 'grounded_answer']), [])
})

test('registry validation rejects duplicate capabilities and malformed evidence contracts', () => {
  const base = mandatoryAiGovernanceCapabilities[0]
  assert.ok(base)
  const errors = validateAiCapabilityRegistry([
    base,
    { ...base },
    { ...base, capabilityKey: 'ai.invalid.optional', mandatoryForE2E: false },
    { ...base, capabilityKey: 'ai.invalid.empty-evidence', evidenceRequirements: [] },
    { ...base, capabilityKey: 'ai.invalid.duplicate-evidence', evidenceRequirements: ['evidence', 'evidence'] },
  ])
  assert.ok(errors.some(error => error.includes('unique')))
  assert.ok(errors.some(error => error.includes('not mandatory')))
  assert.ok(errors.some(error => error.includes('must not be empty')))
})
