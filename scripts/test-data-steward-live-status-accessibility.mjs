import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const quality = await readFile(new URL('../app/data-quality/quality-run-button.tsx', import.meta.url), 'utf8')
const glossary = await readFile(new URL('../app/glossary/glossary-manager.tsx', import.meta.url), 'utf8')
const issues = await readFile(new URL('../app/issues/issue-manager.tsx', import.meta.url), 'utf8')
const stewardship = await readFile(new URL('../app/stewardship/stewardship-manager.tsx', import.meta.url), 'utf8')
const classification = await readFile(new URL('../app/classification/classification-manager.tsx', import.meta.url), 'utf8')

for (const [label, source] of [
  ['Data Quality', quality],
  ['Glossary', glossary],
  ['Issues', issues],
  ['Stewardship', stewardship],
  ['Classification', classification],
]) {
  assert.match(source, /role="status"/, `${label} must expose dynamic workflow status to assistive technology.`)
}

for (const [label, source] of [
  ['Data Quality', quality],
  ['Glossary', glossary],
  ['Issues', issues],
]) {
  assert.match(source, /aria-live="polite"/, `${label} asynchronous status must use a polite live region.`)
}

assert.match(quality, /aria-disabled=\{disabled\}/, 'Data Quality execution state must expose disabled semantics.')
assert.match(issues, /aria-label="Add comment"/, 'Issue comment icon action must retain an explicit accessible name.')

console.log('Data Steward live-status accessibility contract passed.')
