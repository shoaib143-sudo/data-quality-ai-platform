import test from 'node:test'
import assert from 'node:assert/strict'
import { READINESS_CAPABILITIES, readinessCapabilitiesForContext, unresolvedHumanCapabilities } from '../lib/governance/unified-readiness-framework.ts'
import { evaluateReadiness } from '../lib/governance/unified-readiness-engine.ts'

test('capability identifiers are unique and ten dimensions are represented', () => {
  assert.equal(new Set(READINESS_CAPABILITIES.map(x => x.id)).size, READINESS_CAPABILITIES.length)
  assert.equal(new Set(READINESS_CAPABILITIES.map(x => x.dimensionId)).size, 10)
})

test('AI governance is not scored as zero when AI is not applicable', () => {
  const capabilities = readinessCapabilitiesForContext({ usesAi: false })
  assert.equal(capabilities.some(x => x.id === 'URA-AIGOV-RISK-001'), false)
})

test('observable capabilities are not redundantly placed in human question plan', () => {
  const unresolved = unresolvedHumanCapabilities({ usesAi: true }, new Set())
  assert.equal(unresolved.some(x => x.evidenceMode === 'OBSERVABLE'), false)
  assert.equal(unresolved.some(x => x.id === 'URA-SEM-GROUNDING-001'), true)
})

test('critical failure cannot be hidden by a strong aggregate score', () => {
  const capabilities = READINESS_CAPABILITIES.filter(x => ['URA-QUAL-DQ-001','URA-GOV-POLICY-001'].includes(x.id))
  const evidence = [
    { capabilityId:'URA-QUAL-DQ-001', sourceType:'SYSTEM', source:'dq', maturity:5, observedAt:'2026-09-30T00:00:00Z', freshness:'CURRENT', reliability:1 },
    { capabilityId:'URA-GOV-POLICY-001', sourceType:'SYSTEM', source:'policy', maturity:1, observedAt:'2026-09-30T00:00:00Z', freshness:'CURRENT', reliability:1 },
  ]
  const result = evaluateReadiness(capabilities, evidence)
  assert.equal(result.overallGate, 'NOT_CLEARED')
  assert.equal(result.criticalFailures.length, 1)
})

test('stale and expired evidence reduce confidence rather than silently proving readiness', () => {
  const capability = READINESS_CAPABILITIES.find(x => x.id === 'URA-QUAL-DQ-001')
  const result = evaluateReadiness([capability], [
    { capabilityId:capability.id, sourceType:'SYSTEM', source:'dq', maturity:5, observedAt:'2025-01-01T00:00:00Z', freshness:'EXPIRED', reliability:1 },
  ])
  assert.equal(result.aggregateScore, null)
  assert.equal(result.overallGate, 'CONDITIONAL')
})
