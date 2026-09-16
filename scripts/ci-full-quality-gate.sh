#!/usr/bin/env bash
set -euo pipefail

node scripts/verify-p0-p4-revalidation.mjs
node scripts/verify-post-implementation-certification-contract.mjs
node --test scripts/test-post-implementation-certification-contract.mjs
node --experimental-strip-types --test scripts/test-certification-independence.mjs
pnpm exec tsc --noEmit
pnpm run verify:data-plane-config
pnpm run verify:data-plane-operations
pnpm run verify:agent-portfolio
pnpm run verify:agent-specialization
node scripts/verify-specialist-governance-intelligence.mjs
pnpm run verify:agent-memory-learning
pnpm run verify:telemetry-provider
pnpm run verify:evaluation-engine
pnpm run verify:intelligent-router
pnpm run verify:routing-policy
pnpm run verify:route-telemetry
pnpm run verify:execution-controller
node scripts/verify-adr006-cost-accounting.mjs
pnpm run verify:investigation-prediction
pnpm run verify:governed-autonomy
pnpm run verify:ai-due-diligence
node scripts/verify-ai-system-governance.mjs
node scripts/verify-ai-capability-matrix.mjs
node scripts/verify-governance-document-semantic-refresh.mjs
node scripts/verify-governance-reference-readiness.mjs
pnpm run verify:governance-reviews
pnpm run verify:control-intelligence
node scripts/verify-governance-control-operability.mjs
node scripts/verify-governance-intelligence-brief.mjs
pnpm run verify:readiness
pnpm run verify:provider-fallback
pnpm run verify:knowledge-model
pnpm run verify:quality-intelligence
pnpm run verify:file-onboarding
node scripts/verify-native-hierarchy-connectors.mjs
node scripts/verify-catalog-identity-versioning.mjs
node scripts/verify-catalog-reconciliation-indexes.mjs
node scripts/verify-catalog-control-plane-indexes.mjs
node scripts/verify-catalog-source-policy-capability-indexes.mjs
node scripts/verify-profiling-quality-rule-indexes.mjs
node scripts/verify-governance-risk-prediction-indexes.mjs
node scripts/verify-ai-governance-suggestion-indexes.mjs
node scripts/verify-glossary-governance-indexes.mjs
node scripts/verify-control-scope-indexes.mjs
node scripts/verify-workflow-event-indexes.mjs
node scripts/verify-autonomy-event-policy-indexes.mjs
node scripts/verify-autonomy-policy-version-indexes.mjs
node scripts/verify-source-operational-readiness.mjs
node scripts/verify-onboarding-operational-evidence.mjs
node scripts/verify-jdbc-discovery-evidence.mjs
node scripts/verify-governance-report-source-evidence.mjs
node scripts/verify-generic-jdbc-acceptance.mjs
node scripts/verify-security-advisor-hardening.mjs
node scripts/verify-non-lineage-enterprise-acceptance.mjs
node scripts/verify-ai-lineage-suggestions.mjs
node scripts/verify-databricks-web-ui-flow.mjs
node --experimental-strip-types scripts/test-databricks-schema-scope.mjs
pnpm run verify:profiling-lifecycle
pnpm run verify:profiling-explorer
pnpm run verify:governance
pnpm run verify:semantic
node scripts/verify-business-glossary-semantics.mjs
node scripts/verify-ownership-stewardship.mjs
node scripts/verify-classification-privacy.mjs
pnpm run verify:remediation
pnpm run verify:learning
pnpm run verify:reprofile
pnpm run verify:autonomous
pnpm run verify:lineage-governance
node scripts/verify-lineage-atomic-ingestion.mjs
node scripts/verify-lineage-source-identity.mjs
node scripts/verify-lineage-manual-write-boundary.mjs
pnpm run verify:lineage-explorer
node scripts/verify-domain-cell-job-monitor.mjs

if [[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" && -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  pnpm run verify:database
else
  echo 'Live database verification is NOT_MEASURED because protected credentials are unavailable.'
fi

pnpm run build
