import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/catalog/dataset/[datasetId]/page.tsx', 'utf8')

assert.ok(page.includes("type RecentProfileRun="), 'Dataset 360 must model recent profile evidence explicitly')
assert.ok(page.includes(".order('started_at',{ascending:false}).limit(6)"), 'Dataset 360 profile history must be bounded and newest-first')
assert.ok(page.includes('run=recentRuns[0]??null'), 'latest Dataset 360 score/findings context must derive from the newest profile history item')
assert.ok(page.includes('Recent profile history'), 'Dataset 360 must visibly expose profile history')
assert.ok(page.includes("recentRuns.map(item=>canProfiling?"), 'profile history drilldowns must remain profiling-access gated')
assert.ok(page.includes("/profiling/explorer?runId="), 'profile history must deep-link into persisted profiling evidence')
assert.ok(page.includes('No profiling history is available for the current dataset version.'), 'Dataset 360 must expose an explicit empty state for profile history')
assert.ok(!page.includes('.limit(1).maybeSingle()\n    if(runResult.error)'), 'Dataset 360 must not regress to a latest-only profile query')

console.log('Dataset 360 profile history UX contract passed.')
