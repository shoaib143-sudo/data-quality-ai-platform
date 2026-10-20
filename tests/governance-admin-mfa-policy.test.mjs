import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
const source = readFileSync(new URL('../lib/auth/governance-admin-mfa-policy.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const module = { exports: {} }
new Function('module', 'exports', 'require', js)(module, module.exports, createRequire(import.meta.url))
const decide = module.exports.decideGovernanceAdminMfa
const input = { authenticated: true, isGovernanceAdmin: true, currentLevel: 'aal2', nextLevel: 'aal2' }
test('allows verified administrator with aal2', () => assert.equal(decide(input), 'allow'))
test('rejects anonymous requests', () => assert.equal(decide({ ...input, authenticated: false }), 'deny'))
test('rejects non-admin requests', () => assert.equal(decide({ ...input, isGovernanceAdmin: false }), 'deny'))
test('requires challenge for enrolled aal1', () => assert.equal(decide({ ...input, currentLevel: 'aal1' }), 'challenge'))
test('requires enrollment for unenrolled aal1', () => assert.equal(decide({ ...input, currentLevel: 'aal1', nextLevel: 'aal1' }), 'enroll'))
test('rejects unknown assurance state', () => assert.equal(decide({ ...input, currentLevel: null }), 'deny'))
test('rejects unknown next level', () => assert.equal(decide({ ...input, currentLevel: 'aal1', nextLevel: null }), 'deny'))
