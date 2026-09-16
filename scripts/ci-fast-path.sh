#!/usr/bin/env bash
set -euo pipefail

# Fast-path PR gate: keep security, migration, type, governance and build safety
# while deferring expensive end-to-end certification to the exact merged main SHA.
node scripts/verify-p0-p4-revalidation.mjs
node scripts/audit-user-facing-admin-routes.mjs
node scripts/verify-migration-version-uniqueness.mjs
node scripts/verify-governance-runtime-wiring.mjs
pnpm exec tsc --noEmit
node --experimental-strip-types scripts/test-governance-orchestrator.mjs
node --experimental-strip-types scripts/test-governance-outcome-report.mjs
node --experimental-strip-types scripts/test-governance-recovery.mjs
node --experimental-strip-types scripts/test-governed-handoff.mjs
pnpm run verify:github-governance
pnpm run verify:profiling-explorer
pnpm run build
