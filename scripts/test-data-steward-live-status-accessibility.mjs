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
for (const label of ['Governed project','Business term','Business definition','Domain','Synonyms']) {
  assert.ok(glossary.includes(`aria-label="${label}"`), `Glossary input missing accessible label: ${label}`)
}
for (const label of ['Governed project','Governed dataset','Issue title','Description and business impact','Issue severity','Resolution summary and evidence','Issue comment']) {
  assert.ok(issues.includes(`aria-label="${label}"`), `Issue workflow input missing accessible label: ${label}`)
}
for (const label of ['Stewardship target type','Stewardship target','Assignee','Stewardship role','Accountability statement']) {
  assert.ok(stewardship.includes(`aria-label="${label}"`), `Stewardship input missing accessible label: ${label}`)
}
for (const label of ['Governed project','Classification label','Policy name','Policy description','Retention days']) {
  assert.ok(classification.includes(`aria-label="${label}"`), `Classification input missing accessible label: ${label}`)
}

console.log('Data Steward live-status accessibility contract passed.')
