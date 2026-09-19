import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../lib/storage/r2-cors.ts', import.meta.url), 'utf8')

test('R2 CORS certification compares exact rule cardinality and values', () => {
  assert.match(source, /corsRuleBlocks/)
  assert.match(source, /actualRules\.length !== rules\.length/)
  assert.match(source, /sameValues\(tagValues\(xml, 'AllowedOrigin'\), rule\.allowedOrigins\)/)
  assert.match(source, /sameValues\(tagValues\(xml, 'AllowedMethod'\), rule\.allowedMethods\)/)
  assert.match(source, /sameValues\(tagValues\(xml, 'AllowedHeader'\), rule\.allowedHeaders\)/)
  assert.match(source, /sameValues\(tagValues\(xml, 'ExposeHeader'\), rule\.exposeHeaders\)/)
  assert.match(source, /sameValues\(tagValues\(xml, 'MaxAgeSeconds'\), \[String\(rule\.maxAgeSeconds\)\]\)/)
})

test('R2 CORS certification rejects wildcard and additional unmatched rules', () => {
  assert.match(source, /r2CorsHasWildcardOrigin\(xml\)/)
  assert.match(source, /unmatched\.findIndex/)
  assert.match(source, /if \(index < 0\) return false/)
  assert.match(source, /return unmatched\.length === 0/)
})
