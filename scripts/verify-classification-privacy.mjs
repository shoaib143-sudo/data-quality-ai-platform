import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260906031000_governed_classification_privacy.sql', 'utf8')
const proposalRoute = fs.readFileSync('app/api/classifications/route.ts', 'utf8')
const reviewRoute = fs.readFileSync('app/api/classifications/[classificationId]/route.ts', 'utf8')
const page = fs.readFileSync('app/classification-privacy/page.tsx', 'utf8')
const manager = fs.readFileSync('app/classification-privacy/classification-privacy-manager.tsx', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Classification/privacy contract missing: ${label}`)
}
function rejectText(text, needle, label) {
  if (text.includes(needle)) throw new Error(`Classification/privacy contract violated: ${label}`)
}

requireText(migration, "target_type in ('DATASET','CATALOG_ASSET')", 'dataset and stable catalog targets')
requireText(migration, 'catalog_identity_key', 'stable catalog identity binding')
requireText(migration, 'DERIVED_LOCATOR_VALIDATED_AGAINST_CURRENT_ASSET', 'field locator semantics are explicit')
requireText(migration, "origin in ('SOURCE_OBSERVED','AI_SUGGESTED','HUMAN_APPROVED','POLICY_DERIVED')", 'classification provenance vocabulary')
requireText(migration, "authority_state in ('OBSERVED_ONLY','PROPOSED','AUTHORITATIVE','REJECTED')", 'authority state is separate from observation')
requireText(migration, "new.origin in ('SOURCE_OBSERVED','AI_SUGGESTED')", 'observation and AI authority guard')
requireText(migration, 'cannot become authoritative without human review', 'human review required for observed/AI authority')
requireText(migration, 'classification_events', 'append-only classification evidence')
requireText(migration, 'classification_events_append_only', 'classification evidence immutability')
requireText(migration, 'Classification decisions are governed history and cannot be hard-deleted', 'classification decision history preserved')
requireText(migration, 'refresh_classification_target_validity', 'catalog target validity refresh')
requireText(migration, 'catalog_revision_refresh_classifications', 'catalog publication refresh hook')
requireText(migration, "raise warning 'Classification target validity refresh failed", 'classification refresh cannot block catalog publication')
requireText(migration, 'classification_catalog_coverage', 'catalog privacy coverage read model')
requireText(migration, 'classification_dataset_coverage', 'dataset privacy coverage read model')
requireText(migration, 'privacy_control_hooks', 'declarative privacy/control hooks')
requireText(migration, "'DECLARATIVE_ONLY'::text as enforcement_state", 'external enforcement is not fabricated')
requireText(migration, 'External access/masking engines remain authoritative for enforcement', 'source enforcement authority is explicit')
requireText(migration, 'revoke insert,update,delete on governance.dataset_classifications from authenticated', 'classification browser DML closed')
requireText(migration, 'revoke insert,update,delete on governance.classification_labels from authenticated', 'taxonomy browser DML closed')
requireText(migration, 'verify_classification_privacy_posture', 'production posture verifier')
requireText(migration, "'source_observation_is_authority',false", 'source observation is not governed authority')
requireText(migration, "'ai_suggestion_is_authority',false", 'AI suggestion is not governed authority')
rejectText(migration, "'ENFORCED'::text as enforcement_state", 'declarative controls presented as enforced')

requireText(proposalRoute, "authorizeProject(user.id, projectId, 'classification.review')", 'classification proposal capability boundary')
requireText(proposalRoute, "p_origin: 'HUMAN_APPROVED'", 'web proposal provenance')
requireText(proposalRoute, "authority_boundary: 'HUMAN_REVIEW_REQUIRED'", 'proposal does not imply authority')
requireText(reviewRoute, "rpc('review_dataset_classification'", 'review uses governed database workflow')
requireText(reviewRoute, "['APPROVED', 'REJECTED']", 'explicit human final decision vocabulary')
requireText(page, 'Separate source observations and AI suggestions from human-approved governance authority.', 'UI explains authority boundary')
requireText(manager, 'No governance authority was implied by the proposal.', 'proposal UI is truthful')
requireText(manager, 'external enforcement is not claimed', 'privacy enforcement boundary is visible')

console.log('Governed classification and privacy contracts verified.')
