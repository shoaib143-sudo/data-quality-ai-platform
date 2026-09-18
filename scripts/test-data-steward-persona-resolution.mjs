import assert from 'node:assert/strict'
import { resolvePersonaFromRoleLabels } from '../lib/governance/resolve-persona.ts'

assert.equal(resolvePersonaFromRoleLabels(['DATA_STEWARD'], 'MEMBER'), 'data-steward')
assert.equal(resolvePersonaFromRoleLabels([' data_steward '], 'MEMBER'), 'data-steward')
assert.equal(resolvePersonaFromRoleLabels(['DATA_STEWARD'], 'OWNER'), 'data-steward', 'Explicit governance persona must win over organization privilege fallback.')
assert.equal(resolvePersonaFromRoleLabels([], 'MEMBER'), 'business-user')
assert.equal(resolvePersonaFromRoleLabels([], 'OWNER'), 'senior-leadership')
assert.notEqual(resolvePersonaFromRoleLabels(['DATA_STEWARD'], 'MEMBER'), 'data-governance-admin')

console.log('Data Steward persona resolution contract: PASS')
