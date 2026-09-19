import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync('app/glossary/glossary-manager.tsx','utf8')

test('Data Steward glossary form controls expose accessible names', () => {
  for (const label of [
    'Project for new governed term',
    'Business term',
    'Business definition',
    'Business domain',
    'Synonyms, comma separated',
    'Glossary project',
    'Mapping target type',
    'Mapping target',
    'Catalog asset column',
    'Dataset column, optional',
  ]) assert.ok(source.includes(`aria-label="${label}"`), label)
})

test('Data Steward glossary status feedback is announced politely', () => {
  assert.match(source, /role="status"/)
  assert.match(source, /aria-live="polite"/)
})

test('governed glossary action buttons remain explicit text actions', () => {
  for (const label of ['Adopt','Submit','Approve','Deprecate','Reopen','Reject','Propose']) {
    assert.ok(source.includes(label), label)
  }
})
