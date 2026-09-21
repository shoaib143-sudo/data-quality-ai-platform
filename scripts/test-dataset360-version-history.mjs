import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/catalog/dataset/[datasetId]/page.tsx', 'utf8')

assert.ok(page.includes(".order('version_number',{ascending:false}).limit(8)"), 'Dataset 360 version history must be bounded and newest-first')
assert.ok(page.includes('const recentVersions=versionResult.data??[]'), 'Dataset 360 must keep bounded version history')
assert.ok(page.includes('const version=recentVersions[0]??null'), 'current Dataset 360 version must derive from the newest version record')
assert.ok(page.includes('Dataset version history'), 'Dataset 360 must visibly expose version history')
assert.ok(page.includes('{recentVersions.length} version'), 'Dataset 360 must disclose history count')
assert.ok(page.includes('item.observed_at?') && page.includes('Observed '), 'version history must prefer governed observation time when available')
assert.ok(page.includes('No dataset version history is available.'), 'Dataset 360 must provide an explicit version-history empty state')
assert.ok(!page.includes(".limit(1).maybeSingle(),\n    supabase.schema('governance').from('dataset_catalog')"), 'Dataset 360 must not regress to latest-version-only retrieval')

console.log('Dataset 360 version-history contract passed.')
