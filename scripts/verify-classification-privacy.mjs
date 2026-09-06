import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260906031000_governed_classification_privacy.sql', 'utf8')

function requireText(needle, label) {
  if (!migration.includes(needle)) throw new Error(`Classification/privacy contract missing: ${label}`)
}
function rejectText(needle, label) {
  if (migration.includes(needle)) throw new Error(`Classification/privacy contract violated: ${label}`)
}

requireText("target_type in ('DATASET','CATALOG_ASSET')", 'dataset and stable catalog targets')
requireText('catalog_identity_key', 'stable catalog identity binding')
requireText('DERIVED_LOCATOR_VALIDATED_AGAINST_CURRENT_ASSET', 'field locator semantics are explicit')
requireText("origin in ('SOURCE_OBSERVED','AI_SUGGESTED','HUMAN_APPROVED','POLICY_DERIVED')", 'classification provenance vocabulary')
requireText("authority_state in ('OBSERVED_ONLY','PROPOSED','AUTHORITATIVE','REJECTED')", 'authority state is separate from observation')
requireText("new.origin in ('SOURCE_OBSERVED','AI_SUGGESTED')", 'observation and AI authority guard')
requireText('cannot become authoritative without human review', 'human review required for observed/AI authority')
requireText('classification_events', 'append-only classification evidence')
requireText('classification_events_append_only', 'classification evidence immutability')
requireText('Classification decisions are governed history and cannot be hard-deleted', 'classification decision history preserved')
requireText('refresh_classification_target_validity', 'catalog target validity refresh')
requireText('catalog_revision_refresh_classifications', 'catalog publication refresh hook')
requireText("raise warning 'Classification target validity refresh failed", 'classification refresh cannot block catalog publication')
requireText('classification_catalog_coverage', 'catalog privacy coverage read model')
requireText('classification_dataset_coverage', 'dataset privacy coverage read model')
requireText('privacy_control_hooks', 'declarative privacy/control hooks')
requireText("'DECLARATIVE_ONLY'::text as enforcement_state", 'external enforcement is not fabricated')
requireText('External access/masking engines remain authoritative for enforcement', 'source enforcement authority is explicit')
requireText('revoke insert,update,delete on governance.dataset_classifications from authenticated', 'classification browser DML closed')
requireText('revoke insert,update,delete on governance.classification_labels from authenticated', 'taxonomy browser DML closed')
requireText('verify_classification_privacy_posture', 'production posture verifier')
requireText("'source_observation_is_authority',false", 'source observation is not governed authority')
requireText("'ai_suggestion_is_authority',false", 'AI suggestion is not governed authority')
rejectText("'ENFORCED'::text as enforcement_state", 'declarative controls presented as enforced')

console.log('Governed classification and privacy contracts verified.')
