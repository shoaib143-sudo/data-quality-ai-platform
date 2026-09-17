import assert from 'node:assert/strict'

import { requiresProductionPreview } from './classify-production-preview-change.mjs'

assert.equal(requiresProductionPreview([]), false)
assert.equal(requiresProductionPreview(['docs/profiling.md']), false)
assert.equal(requiresProductionPreview(['scripts/test-profiling-metric-runtime.ts']), false)
assert.equal(requiresProductionPreview(['supabase/migrations/20260918030000_sync_profile_run_execution_facts.sql']), false)
assert.equal(requiresProductionPreview(['.github/workflows/delegation-admin-policy.yml']), false)
assert.equal(requiresProductionPreview(['lib/profiling/metric-engine.ts']), true)
assert.equal(requiresProductionPreview(['app/profiling/page.tsx']), true)
assert.equal(requiresProductionPreview(['components/profiling/run-card.tsx']), true)
assert.equal(requiresProductionPreview(['package.json']), true)
assert.equal(requiresProductionPreview(['pnpm-lock.yaml']), true)
assert.equal(requiresProductionPreview(['vercel.json']), true)
assert.equal(requiresProductionPreview(['scripts/test.ts', 'public/manifest.json']), true)

console.log('Production preview change classifier tests passed.')
