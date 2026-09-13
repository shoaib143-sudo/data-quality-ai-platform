import fs from 'node:fs'

const page = fs.readFileSync('app/home/[persona]/page.tsx', 'utf8')
const landing = fs.readFileSync('components/governance/role-landing-page.tsx', 'utf8')

const checks = [
  ['Data Domain is canonical UI nomenclature', landing.includes('aria-label="Data Domain"') && landing.includes('All Data Domains') && landing.includes('>Data Domain</th>')],
  ['business context BUSINESS_DOMAIN renders as Data Domain', page.includes("if (normalized === 'BUSINESS_DOMAIN') return 'Data Domain'")],
  ['available Data Domains remain selectable after scoping', landing.includes('data.availableDomains.map')],
  ['dataset filter cannot override a different selected Data Domain', page.includes("item.id === requested.datasetId && (requestedDomain === 'overall' || item.domain === requestedDomain)")],
  ['landing dataset evidence is scoped', page.includes('scopedDatasetSummaries') && page.includes('scopedDatasetIds')],
  ['confidence and profiling coverage are scoped', page.includes('scopedDatasetIds.has(datasetId)') && page.includes('completedLatestRuns.length / scopedDatasetSummaries.length')],
  ['findings are scoped', page.includes('const currentMaterial = scopedDatasetSummaries.flatMap')],
  ['issues and certifications are scoped to selected datasets', page.includes('scopedIssues') && page.includes('scopedDatasetIds.has(request.dataset_id)')],
  ['business impact links are scoped', page.includes('if (!scopedDatasetIds.has(link.dataset_id)) continue')],
  ['glossary, classification and CDE evidence are scoped', page.includes('scopedGlossaryMappings') && page.includes('scopedClassifications') && page.includes('scopedCdeMappings')],
  ['mixed project-wide evidence is disclosed', landing.includes('remains project-wide where the underlying governed record has no Data Domain binding')],
]

const failures = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) process.exit(1)
console.log('PASS persona landing scope integrity contract')
