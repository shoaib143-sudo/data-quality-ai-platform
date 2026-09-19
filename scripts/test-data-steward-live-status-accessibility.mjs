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
for (const label of ['Project for new governed term','Glossary project','Business term','Business definition','Business domain','Synonyms, comma separated']) {
  assert.ok(glossary.includes(`aria-label="${label}"`), `Glossary input missing accessible label: ${label}`)
}
for (const label of ['Governed project','Governed dataset','Issue title','Description and business impact','Issue severity','Resolution summary and evidence','Issue comment']) {
  assert.ok(issues.includes(`aria-label="${label}"`), `Issue workflow input missing accessible label: ${label}`)
}
for (const label of ['Stewardship target type','Stewardship target','Assignee','Stewardship role','Accountability statement','Certification dataset']) {
  assert.ok(stewardship.includes(`aria-label="${label}"`), `Stewardship input missing accessible label: ${label}`)
}
for (const label of ['Governed project','Classification label','Policy name','Policy description','Retention days']) {
  assert.ok(classification.includes(`aria-label="${label}"`), `Classification input missing accessible label: ${label}`)
}

for (const label of ['Mapping target type','Mapping target','Catalog asset column','Dataset column, optional']) {
  assert.ok(glossary.includes(`aria-label="${label}"`), `Glossary mapping control missing accessible label: ${label}`)
}
assert.ok(issues.includes('aria-label={`Issue owner for ${issue.title}`}'), 'Issue owner selector must be labelled per issue.')
assert.ok(issues.includes('aria-label={`Issue status for ${issue.title}`}'), 'Issue status selector must be labelled per issue.')
const classificationPage = await readFile(new URL('../app/classification/page.tsx', import.meta.url), 'utf8')
assert.match(classificationPage, /classification\.review/, 'Classification page must resolve project-scoped review authority.')
assert.match(classificationPage, /classificationReviewProjectIds/, 'Classification page must pass review-authorized projects into the client workbench.')
assert.match(classification, /classificationReviewProjectIds/, 'Classification workbench must receive explicit review-authorized project scope.')
assert.match(classification, /canReviewClassification/, 'Classification workbench must gate review controls by project capability.')
assert.match(classification, /classification\.status === 'SUGGESTED' && canReviewClassification/, 'Suggested classification review buttons must be hidden without authority.')
assert.match(classification, /does not allow classification review/, 'Unauthorized classification review must produce a clear UX message.')

console.log('Data Steward live-status accessibility contract passed.')
