import fs from 'node:fs'

const registry = fs.readFileSync('lib/ai/model-registry.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-model-registry.ts', 'utf8')
const lifecycle = fs.readFileSync('supabase/migrations/20260906062000_govern_ai_systems.sql', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`ModelRegistry contract missing: ${label}`)
}

requireText(registry, 'export interface ModelRegistry', 'stable model registry interface')
requireText(registry, 'listCurrent(request: ModelRegistryRequest)', 'read-only current-version lookup')
requireText(registry, "row.lifecycle_status !== 'ACTIVE'", 'fail-closed lifecycle eligibility')
requireText(registry, 'ACTIVE_HUMAN_APPROVED_CURRENT_VERSION', 'explicit governed eligibility provenance')
requireText(registry, 'evaluationScorecard', 'evaluation evidence attached to registry entries')
requireText(adapter, "from('ai_systems')", 'governed AI system registry source')
requireText(adapter, 'ai_system_versions!ai_systems_current_version_fk', 'exact current version relationship')
requireText(adapter, 'createGovernanceEvaluationEngine', 'evaluation engine integration')
requireText(lifecycle, "lifecycle_status=case when v_decision='APPROVED' then 'ACTIVE' else 'DRAFT' end", 'human approval controls ACTIVE lifecycle')
requireText(lifecycle, "current_version_id=v_version_id,lifecycle_status='DRAFT'", 'new version revokes active authority')
requireText(lifecycle, 'NO_AUTOMATIC_DEPLOYMENT_AUTHORITY', 'no automatic deployment authority')

if (/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(adapter)) {
  throw new Error('ModelRegistry adapter must remain read-only.')
}
if (registry.includes('averageScore') && registry.includes('routingEligible =')) {
  throw new Error('Evaluation score must not directly create routing eligibility.')
}

console.log('ADR-006 ModelRegistry contract verified.')
