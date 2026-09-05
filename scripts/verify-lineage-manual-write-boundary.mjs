import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260905040015_govern_manual_lineage_edge_writes.sql', 'utf8')
const route = fs.readFileSync('app/api/lineage/route.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Manual lineage write boundary missing: ${label}`)
}

requireText(migration, 'upsert_manual_lineage_edge', 'governed manual lineage RPC')
requireText(migration, "has_project_capability(p_project_id,p_actor,'lineage.manage')", 'database lineage.manage authorization')
requireText(migration, "when 'DATA_SOURCE'", 'data source project validation')
requireText(migration, "when 'DATASET'", 'dataset project validation')
requireText(migration, "when 'DATASET_VERSION'", 'dataset version project validation')
requireText(migration, "when 'PROFILE_RUN'", 'profile run project validation')
requireText(migration, "when 'AGENT_RUN'", 'agent run project validation')
requireText(migration, "when 'EXTERNAL_ASSET'", 'external asset project validation')
requireText(migration, 'Source lineage node does not belong to this project', 'source tenant boundary')
requireText(migration, 'Target lineage node does not belong to this project', 'target tenant boundary')
requireText(migration, "'LINEAGE_EDGE_MANUALLY_UPSERTED'", 'manual lineage immutable audit event')
requireText(migration, "'atomic_with_edge',true", 'atomic edge/audit evidence')
requireText(migration, "'audit_atomic',true", 'RPC atomic audit confirmation')
requireText(migration, 'revoke insert, update, delete on governance.lineage_edges from anon, authenticated', 'browser edge write revocation')
requireText(migration, 'revoke insert, update, delete on governance.lineage_integrations from anon, authenticated', 'browser integration write revocation')
requireText(migration, 'grant execute on function governance.upsert_manual_lineage_edge', 'service-role RPC boundary')

requireText(route, "authorizeProject(user.id, projectId, 'lineage.manage')", 'route lineage.manage authorization')
requireText(route, "rpc('upsert_manual_lineage_edge'", 'route governed RPC usage')
requireText(route, 'data.audit_atomic !== true', 'route requires atomic audit confirmation')
requireText(route, 'data.database_capability_verified !== true', 'route requires database capability confirmation')
if (route.includes("from('lineage_edges').upsert") || route.includes('writeGovernanceAudit')) {
  throw new Error('Manual lineage write boundary missing: route still performs split edge/audit persistence')
}

console.log('Governed manual lineage write boundary verified.')
