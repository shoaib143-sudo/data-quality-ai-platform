import assert from 'node:assert/strict'
import fs from 'node:fs'

const stewardshipPage = fs.readFileSync('app/stewardship/page.tsx','utf8')
const stewardship = fs.readFileSync('app/stewardship/stewardship-manager.tsx','utf8')
const quality = fs.readFileSync('app/data-quality/page.tsx','utf8')
const glossaryPage = fs.readFileSync('app/glossary/page.tsx','utf8')
const glossary = fs.readFileSync('app/glossary/glossary-manager.tsx','utf8')
const classificationPage = fs.readFileSync('app/classification/page.tsx','utf8')
const classification = fs.readFileSync('app/classification/classification-manager.tsx','utf8')
const issuesPage = fs.readFileSync('app/issues/page.tsx','utf8')
const issues = fs.readFileSync('app/issues/issue-manager.tsx','utf8')

assert.match(stewardshipPage, /stewardship\.manage/)
assert.match(stewardshipPage, /stewardshipManageProjectIds/)
assert.match(stewardship, /canManageStewardship/)
assert.match(stewardship, /stewardshipManageProjectIds\.includes\(projectId\)/)

assert.match(quality, /hasProjectCapability\(user\.id, projectId, 'quality\.execute'\)/)
assert.match(quality, /capabilitiesByProject/)
assert.match(quality, /canExecute \? <QualityRunButton/)
assert.doesNotMatch(quality, /<QualityRunButton[^>]+disabled=\{!canExecute/, 'Unauthorized quality execution should not be presented as an executable control.')

assert.match(glossaryPage, /glossary\.manage/)
assert.match(glossaryPage, /manageableProjectIds/)
assert.match(glossary, /canManageSelectedProject/)
assert.match(glossary, /canManageSelectedProject \? <form/)
assert.match(glossary, /manageableProjects\.has\(item\.project_id\)/)

assert.match(classificationPage, /classification\.review/)
assert.match(classificationPage, /classificationReviewProjectIds/)
assert.match(classification, /canReviewClassification/)
assert.match(classification, /classification\.status === 'SUGGESTED' && canReviewClassification/)
assert.match(classificationPage, /policy\.approve/)
assert.match(classification, /canManagePolicy/)

assert.match(issuesPage, /issues\.manage/)
assert.match(issuesPage, /manageableProjectIds/)
assert.match(issues, /manageableProjects/)
assert.match(issues, /manageableProjects\.length \? <form/, 'Issue creation form must only render when at least one project grants issues.manage.')
assert.match(issues, /canManage=\{manageable\.has\(issue\.project_id\)\}/, 'Per-issue mutation controls must be gated by project authority.')

for (const source of [stewardshipPage,quality,glossaryPage,classificationPage,issuesPage]) {
  assert.match(source, /hasProjectCapability|manageableProjectIds|stewardshipManageProjectIds|capabilitiesByProject|classificationReviewProjectIds/, 'Every canonical mutation surface must derive project capability before presenting write controls.')
}

console.log('Data Steward UI authorization visibility contract: PASS')
