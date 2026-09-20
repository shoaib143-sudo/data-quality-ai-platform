import fs from 'node:fs'
import path from 'node:path'

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message)
}

const migration = read('supabase/migrations/20260915025000_agent_evidence_retention_and_legal_hold.sql')
const cleanupMigration = read('supabase/migrations/20260920048000_agent_evidence_retention_cleanup.sql')
const service = read('lib/agents/evidence-lifecycle.ts')
const worker = read('lib/orchestration/worker-service.ts')

requireText(migration, 'retention_years between 5 and 7', 'Retention must stay inside the approved 5-7 year range.')
requireText(migration, "default (now() + interval '7 years')", 'Artifacts/messages must default to seven-year retention.')
requireText(migration, 'apply_artifact_retention_policy_internal', 'Artifact writes must derive retention from the governed project policy.')
requireText(migration, 'apply_message_retention_policy_internal', 'Message writes must derive retention from the governed project policy.')
requireText(migration, 'Cross-project agent messages are not allowed', 'Message lifecycle must fail closed across project boundaries.')
requireText(migration, 'set_evidence_retention_policy_internal', 'Retention changes must be applied by a server-only database function.')
requireText(migration, 'set retention_until = a.created_at + make_interval(years => p_retention_years)', 'Artifact retention changes must update existing project evidence.')
requireText(migration, 'set retention_until = m.created_at + make_interval(years => p_retention_years)', 'Message retention changes must update existing project evidence.')
requireText(migration, 'set search_path = pg_catalog, agent, app', 'Evidence lifecycle SECURITY DEFINER functions must pin search_path.')
requireText(migration, 'agent.evidence_legal_holds', 'Legal hold evidence must be persisted.')
requireText(migration, "where active;", 'Only one active hold per evidence record is allowed.')
requireText(migration, 'revoke all on agent.evidence_legal_holds from anon, authenticated', 'Legal holds must not be directly writable by end-user roles.')
requireText(migration, 'revoke all on function agent.set_evidence_retention_policy_internal(uuid, integer, uuid) from public, anon, authenticated', 'Retention policy mutation RPC must not be executable by end-user roles.')
requireText(service, "hasProjectCapability(input.actorUserId, input.projectId, 'admin.manage')", 'Retention mutations must be server-authorized.')
requireText(service, "rpc('set_evidence_retention_policy_internal'", 'Retention policy updates must flow through the server-authoritative lifecycle RPC.')
requireText(service, "access.persona !== 'data-governance-admin'", 'Legal hold authority must be restricted to the Data Governance Admin persona.')
requireText(service, "hasProjectCapability(actorUserId, projectId, 'admin.manage')", 'Governance Admin legal hold actions must still be project-scoped with admin.manage.')
requireText(service, 'assertGovernanceAdminLegalHoldAuthority(input.actorUserId, input.projectId)', 'Legal hold placement and release must use the dedicated Governance Admin authority gate.')
requireText(service, "Agent artifact is outside the requested project.", 'Artifact legal holds must enforce project scope.')
requireText(service, "Agent message is outside the requested project.", 'Message legal holds must enforce project scope.')
requireText(service, ".from('audit_events')", 'Audit-record legal holds must resolve the immutable governance audit entity.')
requireText(service, 'Audit record does not satisfy immutable audit-chain requirements.', 'Audit-record legal holds must verify hash-chain evidence before acceptance.')
requireText(service, 'Audit record is outside the requested project.', 'Audit-record legal holds must enforce project scope.')
requireText(service, 'if (retentionUntil > Date.now()) return true', 'Deletion must be blocked while retention is active.')
requireText(service, ".eq('active', true)", 'Deletion checks must honor active legal holds.')

console.log('Agent evidence retention and legal hold contract verified.')


requireText(cleanupMigration, 'place_evidence_legal_hold_internal', 'Legal-hold placement must use the atomic database boundary.')
requireText(cleanupMigration, "pg_advisory_xact_lock(hashtextextended(p_evidence_type || ':' || p_evidence_id::text, 0))", 'Legal-hold placement must acquire the shared evidence lock.')
requireText(cleanupMigration, "pg_advisory_xact_lock(hashtextextended('ARTIFACT:' || v_candidate.id::text, 0))", 'Artifact cleanup must acquire the shared evidence lock.')
requireText(cleanupMigration, "pg_advisory_xact_lock(hashtextextended('MESSAGE:' || v_candidate.id::text, 0))", 'Message cleanup must acquire the shared evidence lock.')
requireText(cleanupMigration, "h.active = true", 'Retention cleanup must recheck active legal holds while holding the evidence lock.')
requireText(cleanupMigration, 'governance.ai_governance_suggestions', 'Governance-referenced artifacts must be preserved.')
requireText(cleanupMigration, "disposition := 'STORAGE_BACKED'", 'Storage-backed artifacts must be preserved until object lifecycle cleanup is linked.')
requireText(cleanupMigration, 'delete from agent.agent_artifacts', 'Expired inline artifacts must be deleted by the governed cleanup boundary.')
requireText(cleanupMigration, 'delete from agent.agent_messages', 'Expired messages must be deleted by the governed cleanup boundary.')
requireText(cleanupMigration, 'from public, anon, authenticated', 'Retention cleanup RPCs must not be executable by end-user roles.')
if (cleanupMigration.includes('delete from governance.audit_events')) {
  throw new Error('Immutable governance audit records must never be deleted by agent evidence retention.')
}
requireText(service, "rpc('place_evidence_legal_hold_internal'", 'Legal-hold placement must use the atomic server-only RPC.')
requireText(service, "rpc('cleanup_expired_evidence_internal'", 'Scheduled retention must use the governed cleanup RPC.')
requireText(worker, "cleanupExpiredAgentEvidence(50)", 'Scheduled workers must enforce agent evidence retention.')
