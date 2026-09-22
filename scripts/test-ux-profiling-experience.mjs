import assert from 'node:assert/strict'
import fs from 'node:fs'

const dashboard=fs.readFileSync('app/profiling/profiling-dashboard.tsx','utf8')
const page=fs.readFileSync('app/profiling/page.tsx','utf8')

for(const marker of [
  'Profiling evidence',
  'Profile evidence',
  'Open full profiling report',
  'Data Observability',
  'Data Quality',
  'Run {run.id.slice(0, 8)}',
  'findings.length',
]) assert.ok(dashboard.includes(marker), `profiling UX marker missing: ${marker}`)

assert.ok(dashboard.includes("bg-[#050b17]"), 'profiling dashboard must use the native DataNexus dark canvas')
assert.ok(dashboard.includes("border-white/[0.08] bg-[#0a1d33]"), 'profiling cards must use native dark surfaces')
assert.ok(dashboard.includes('canMonitoring ? <Link href="/monitoring"'), 'observability transition must remain policy gated')
assert.ok(dashboard.includes('canQuality ? <Link href="/data-quality"'), 'quality transition must remain policy gated')
assert.ok(dashboard.includes('canExplorer ? <div className="relative mt-5'), 'full report CTA must remain explorer gated')
assert.ok(page.includes('No profiling evidence yet'), 'empty evidence state must remain explicit')
assert.ok(page.includes("bg-[#050b17]"), 'empty evidence state must share the DataNexus dark canvas')

console.log('Profiling UX experience contract passed.')
