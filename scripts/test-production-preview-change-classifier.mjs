import assert from 'node:assert/strict'

import {
  automaticPreviewEnabledForBranch,
  requiresAutomaticProductionPreview,
  requiresProductionPreview,
} from './classify-production-preview-change.mjs'

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
assert.equal(requiresProductionPreview(['pnpm-workspace.yaml']), true)
assert.equal(requiresProductionPreview(['tsconfig.json']), true)
assert.equal(requiresProductionPreview(['postcss.config.mjs']), true)
assert.equal(requiresProductionPreview(['tailwind.config.ts']), true)
assert.equal(requiresProductionPreview(['proxy.ts']), true)
assert.equal(requiresProductionPreview(['instrumentation.ts']), true)
assert.equal(requiresProductionPreview(['instrumentation-client.ts']), true)
assert.equal(requiresProductionPreview(['vercel.json']), true)
assert.equal(requiresProductionPreview(['scripts/test.ts', 'public/manifest.json']), true)

assert.equal(automaticPreviewEnabledForBranch('main'), false)
assert.equal(automaticPreviewEnabledForBranch('feat/execution-recovery-worker'), false)
assert.equal(automaticPreviewEnabledForBranch('dependabot/npm_and_yarn/next-16.3.5'), false)
assert.equal(automaticPreviewEnabledForBranch('ux/data-steward-live-status'), false)
assert.equal(automaticPreviewEnabledForBranch('preview/release-candidate'), false)
assert.equal(automaticPreviewEnabledForBranch('feat/ui-profile-explorer'), false)
assert.equal(automaticPreviewEnabledForBranch('fix/ui-empty-state'), false)
assert.equal(automaticPreviewEnabledForBranch('feat/frontend-command-center'), false)
assert.equal(automaticPreviewEnabledForBranch('fix/frontend-route-state'), false)

assert.equal(requiresAutomaticProductionPreview('feat/backend-recovery', ['lib/orchestration/worker.ts']), false)
assert.equal(requiresAutomaticProductionPreview('dependabot/npm_and_yarn/next-16.3.5', ['package.json']), false)
assert.equal(requiresAutomaticProductionPreview('ux/data-steward-live-status', ['app/issues/page.tsx']), false)
assert.equal(requiresAutomaticProductionPreview('preview/release-candidate', ['public/manifest.json']), false)
assert.equal(requiresAutomaticProductionPreview('ux/docs-only', ['docs/readme.md']), false)

console.log('Production preview change classifier tests passed.')
