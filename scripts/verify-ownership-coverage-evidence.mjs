import fs from 'node:fs'

const route = fs.readFileSync('app/home/[persona]/page.tsx', 'utf8')

const required = [
  "from('stewardship_dataset_coverage')",
  "coverage_status",
  'stewardshipByDataset',
  "upper(stewardship.coverage_status) !== 'UNASSIGNED'",
  'ownershipCoverage: datasets.length ? Math.round((ownedDatasets / datasets.length) * 100) : 0',
]

for (const token of required) {
  if (!route.includes(token)) throw new Error(`Ownership coverage evidence contract missing: ${token}`)
}

const ownerExpression = route.match(/hasOwner:\s*([^,\n]+)/)?.[1] ?? ''
if (ownerExpression.includes('business_owner_user_id') || ownerExpression.includes('steward_user_id')) {
  throw new Error('Landing ownership evidence must not be derived directly from dataset_catalog owner columns.')
}

console.log('Ownership coverage evidence contract verified.')
