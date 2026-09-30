import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSystemObservation } from '../lib/governance/unified-readiness-observations.ts'

const now=new Date('2026-09-30T00:00:00Z')
test('observation freshness decays deterministically',()=>{
 assert.equal(normalizeSystemObservation({capabilityId:'x',source:'s',maturity:4,observedAt:'2026-09-29T00:00:00Z',maxAgeDays:30},now).freshness,'CURRENT')
 assert.equal(normalizeSystemObservation({capabilityId:'x',source:'s',maturity:4,observedAt:'2026-08-20T00:00:00Z',maxAgeDays:30},now).freshness,'STALE')
 assert.equal(normalizeSystemObservation({capabilityId:'x',source:'s',maturity:4,observedAt:'2026-07-01T00:00:00Z',maxAgeDays:30},now).freshness,'EXPIRED')
})
