#!/usr/bin/env bash
set -euo pipefail

# Merge-critical PR gate: keep only checks that directly protect compilation,
# privileged-route authorization, and migration integrity. Broader governance,
# profiling, recovery, and end-to-end certification remain in dedicated jobs or
# run automatically on the exact merged main SHA.
node scripts/audit-user-facing-admin-routes.mjs
node scripts/verify-migration-version-uniqueness.mjs
pnpm exec tsc --noEmit
pnpm run build
