#!/usr/bin/env bash
set -euo pipefail

# Merge-critical PR gate: keep only checks that directly protect compilation,
# privileged-route authorization, auth proxy boundaries, approval authority,
# agent authority/classification/recursion boundaries, orchestrator fail-closed contracts, and migration integrity.
# Broader governance, profiling, recovery, and end-to-end certification remain
# in dedicated jobs or run automatically on the exact merged main SHA.
node scripts/audit-user-facing-admin-routes.mjs
node scripts/verify-migration-version-uniqueness.mjs
node scripts/verify-delegation-admin-policy.mjs
node --test tests/public-auth-proxy-fast-path.test.mjs
node --experimental-strip-types --test scripts/test-*orchestrator*.mjs
pnpm run verify:agent-portfolio
pnpm exec tsc --noEmit
pnpm run build
