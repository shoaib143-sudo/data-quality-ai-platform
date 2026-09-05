import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260906010000_harden_catalog_identity_version_change.sql', 'utf8')
const positionFix = fs.readFileSync('supabase/migrations/20260906010300_exclude_field_position_from_structure_versioning.sql', 'utf8')
const connector = fs.readFileSync('supabase/functions/dgp-native-hierarchy-connector/index.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Catalog identity/versioning contract missing: ${label}`)
}
function requirePattern(text, pattern, label) {
  if (!pattern.test(text)) throw new Error(`Catalog identity/versioning contract missing: ${label}`)
}

requireText(migration, 'catalog.asset_identity_evidence', 'normalized identity evidence')
requireText(migration, 'PROVIDER_IMMUTABLE_ID', 'provider immutable identity evidence')
requireText(migration, 'QUALIFIED_LOCATOR', 'qualified locator fallback evidence')
requireText(migration, 'supersedes_identity_key', 'identity promotion history')
requireText(migration, 'catalog.asset_locator_history', 'revision-bounded locator history')
requireText(migration, "'RENAMED'", 'rename change semantics')
requireText(migration, "'MOVED'", 'move change semantics')
requirePattern(migration, /if ik not like 'native:%'[\s\S]*delete from catalog\.catalog_change_events[\s\S]*'RENAMED','MOVED'/, 'rename/move require stable provider identity')
requireText(migration, 'catalog.catalog_field_change_events', 'atomic field deltas')
for (const event of ['FIELD_ADDED','FIELD_REMOVED','FIELD_RENAMED','TYPE_CHANGED','NULLABILITY_CHANGED','POSITION_CHANGED','DEFAULT_CHANGED']) {
  requireText(migration, `'${event}'`, `${event} field change event`)
}
requirePattern(migration, /if k like 'native:%'[\s\S]*FIELD_RENAMED/, 'field rename requires immutable provider field identity')
requireText(migration, 'SOURCE_ANNOTATION_CHANGED', 'source annotation history is first-class change evidence')
requireText(migration, 'physical_structure_version_unchanged', 'annotation change is separated from physical structure versioning')
requireText(migration, "array['native_id','qualified_name','native_identity']", 'field locator evidence excluded from structure hash')
requireText(migration, "array['row_count'", 'operational observations excluded from structure hash')
requireText(migration, 'publish_discovery_revision_core', 'proven atomic publication retained under wrapper')
requireText(migration, "'field_events'", 'field deltas included in revision change-set hash')
requireText(migration, 'event_hash text not null unique', 'field event idempotency')
requireText(migration, 'security_invoker=true', 'history view preserves caller RLS')

requireText(positionFix, "'position']", 'connector position evidence excluded from physical structure hash')
requireText(positionFix, '_catalog_locator_duplicate_versions', 'proven duplicate physical versions are normalized')
requirePattern(positionFix, /source_annotation_hash is not distinct from prev\.source_annotation_hash/, 'normalization requires identical source annotations')
requirePattern(positionFix, /catalog\.discovery_structure_hash\(cur[\s\S]*= catalog\.discovery_structure_hash\(prev/, 'normalization requires equal corrected physical structures')
requirePattern(positionFix, /not exists \([\s\S]*catalog\.catalog_field_change_events/, 'normalization refuses versions with atomic field evidence')
requireText(positionFix, 'FIELD_LOCATOR_POSITION_EXCLUDED_FROM_STRUCTURE', 'normalization correction is auditable')
requirePattern(positionFix, /objects_changed=[\s\S]*objects_unchanged=/, 'published revision counts are corrected with evidence')

requirePattern(connector, /stable_object_ids:\s*true,[\s\S]*stable_field_ids:\s*false/, 'PostgreSQL object identity remains stable while field identity is conservative')
requirePattern(connector, /const stableObjectIds = objectNodes\.length > 0 && objectNodes\.every\([\s\S]*stable_object_ids:\s*options\.rootsOnly \? true : stableObjectIds/, 'Databricks roots-only capability introspection preserves provider stable-object support')
requirePattern(connector, /stable_field_ids:\s*false/, 'Databricks field identity remains conservative')
requirePattern(connector, /kind:\s*"FIELD"[\s\S]*nativeId:\s*null[\s\S]*identity_evidence:\s*"DERIVED_LOCATOR"/, 'ordinal-derived field IDs are evidence, not immutable identity')
requirePattern(connector, /tableNativeId = stableId\(tableRow, \["table_id", "id"\]\)/, 'Databricks immutable table identity uses table_id')
if (/kind:\s*"FIELD"[^\n]*nativeId:\s*`\$\{[^}]+\}:\$\{[^}]+\}`/.test(connector)) {
  throw new Error('Catalog identity/versioning contract missing: ordinal-derived field ID is still claimed as native identity')
}

console.log('Catalog identity, versioning, and change-detection contracts verified.')
