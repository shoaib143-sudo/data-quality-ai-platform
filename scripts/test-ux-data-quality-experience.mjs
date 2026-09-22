import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=fs.readFileSync('app/data-quality/page.tsx','utf8')
for(const marker of [
  'Can this data be trusted for its intended use?',
  'Current quality posture',
  'Priority findings',
  'Control failures',
  'Review quality controls',
  'Evidence-backed data quality',
]) assert.ok(source.includes(marker), `data-quality UX marker missing: ${marker}`)

assert.ok(source.includes("bg-[#050b17]"), 'data quality must use the native DataNexus dark canvas')
assert.ok(source.includes('scoreTone(averageScore)'), 'quality posture must remain based on persisted scored runs')
assert.ok(source.includes('criticalFindings.length'), 'priority finding count must remain evidence-backed')
assert.ok(source.includes('failedQualityRules.length'), 'control failure count must remain execution-backed')
assert.ok(source.includes('canProfiling ? <Link href="/profiling/explorer"'), 'profiling evidence transition must remain workspace gated')
assert.ok(source.includes('Business impact is shown only when persisted governance evidence provides it.'), 'quality page must preserve the governed truth boundary')

console.log('Data Quality UX experience contract passed.')
