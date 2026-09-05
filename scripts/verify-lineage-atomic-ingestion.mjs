import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260905034719_atomic_lineage_batch_ingestion.sql', 'utf8')
const replayProtection = fs.readFileSync('supabase/migrations/20260905035122_reject_lineage_replay_payload_collisions.sql', 'utf8')
const edgeIdentity = fs.readFileSync('supabase/migrations/20260905040325_preserve_parallel_lineage_transformations.sql', 'utf8')
const route = fs.readFileSync('app/api/lineage/ingest/route.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Atomic lineage ingestion contract missing: ${label}`)
}

requireText(migration, 'ingest_lineage_batch_atomic', 'transactional lineage batch RPC')
requireText(migration, "has_project_capability(p_project_id,p_actor,'lineage.manage')", 'database lineage authorization')
requireText(migration, 'pg_advisory_xact_lock', 'transaction-scoped concurrent retry lock')
requireText(migration, 'hashtextextended', 'project/event lock identity')
requireText(migration, 'on conflict(project_id,source_key)', 'integration idempotency')
requireText(migration, 'on conflict(project_id,namespace,name,asset_type)', 'asset idempotency')
requireText(migration, 'on conflict(project_id,integration_id,external_id)', 'transformation idempotency')
requireText(migration, 'on conflict(project_id,source_type,source_id,target_type,target_id,relationship)', 'historical edge identity before transformation-aware hardening')
requireText(migration, "'LINEAGE_BATCH_INGESTED'", 'atomic lineage audit')
requireText(migration, "'atomic_with_batch',true", 'atomic batch audit evidence')
requireText(migration, "'audit_atomic',true", 'RPC atomic audit confirmation')
requireText(migration, 'revoke execute on function governance.ingest_lineage_batch_atomic', 'browser RPC execution revocation')
requireText(migration, 'grant execute on function governance.ingest_lineage_batch_atomic', 'service-role RPC boundary')

requireText(replayProtection, 'rename to ingest_lineage_batch_atomic_impl', 'private atomic ingestion implementation')
requireText(replayProtection, 'revoke execute on function governance.ingest_lineage_batch_atomic_impl', 'private implementation execution revocation')
requireText(replayProtection, 'count(distinct lower', 'same-batch external event payload collision detection')
requireText(replayProtection, 'same externalEventId with different payload hashes', 'same-batch collision rejection')
requireText(replayProtection, "v_payload_hash !~ '^[0-9a-f]{64}$'", 'SHA-256 replay hash validation')
requireText(replayProtection, 'Lineage replay payload mismatch for externalEventId', 'persisted replay payload collision rejection')
requireText(replayProtection, 'Lineage replay source mismatch for externalEventId', 'persisted replay source collision rejection')
requireText(replayProtection, 'governance.ingest_lineage_batch_atomic_impl(', 'validated delegation to private atomic implementation')
requireText(replayProtection, 'grant execute on function governance.ingest_lineage_batch_atomic', 'service-role wrapper execution boundary')

requireText(edgeIdentity, 'relationship,transformation_id)', 'transformation-aware edge identity')
requireText(edgeIdentity, 'nulls not distinct', 'NULL-transformation edge idempotency')
requireText(edgeIdentity, 'preserves parallel transformation-specific edges', 'parallel transformation identity intent')
requireText(edgeIdentity, "'governance.ingest_lineage_batch_atomic_impl(uuid,uuid,text,text,text,jsonb)'::regprocedure", 'atomic ingestion producer patch')
requireText(edgeIdentity, "'governance.upsert_manual_lineage_edge(uuid,uuid,text,uuid,text,uuid,text,jsonb)'::regprocedure", 'manual lineage producer patch')
requireText(edgeIdentity, "'governance.record_lineage_for_dataset()'::regprocedure", 'dataset lineage producer patch')
requireText(edgeIdentity, "'governance.record_lineage_for_dataset_version()'::regprocedure", 'dataset version lineage producer patch')
requireText(edgeIdentity, "'governance.record_lineage_for_profile_run()'::regprocedure", 'profile run lineage producer patch')
requireText(edgeIdentity, 'raise exception \'Expected legacy lineage edge conflict identity was not found in %\'', 'producer patch postcondition')

requireText(route, "authorizeProject(user.id, projectId, 'lineage.manage')", 'route lineage authorization')
requireText(route, "rpc('ingest_lineage_batch_atomic'", 'route atomic RPC usage')
requireText(route, 'payloadHash: hashPayload(event)', 'stable normalized-event payload hash')
requireText(route, 'data.audit_atomic !== true', 'route requires atomic audit confirmation')
requireText(route, 'data.database_capability_verified !== true', 'route requires database capability confirmation')
if (route.includes("from('lineage_integrations').upsert") || route.includes("from('lineage_edges').upsert") || route.includes("from('lineage_column_mappings').insert")) {
  throw new Error('Atomic lineage ingestion contract missing: route still performs multi-request lineage persistence')
}

console.log('Atomic lineage ingestion contracts verified.')
