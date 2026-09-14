import fs from 'node:fs'
import path from 'node:path'

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}
function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message)
}

const migration = read('supabase/migrations/20260915025000_agent_evidence_retention_and_legal_hold.sql')
const service = read('lib/agents/evidence-lifecycle.ts')

requireText(migration, 'retention_years between 5 and 7', 'Retention must stay inside the approved 5-7 year range.')
requireText(migration, "default (now() + interval '7 years')", 'Artifacts/messages must default to seven-year retention.')
requireText(migration, 'agent.evidence_legal_holds', 'Legal hold evidence must be persisted.')
requireText(migration, "where active;", 'Only one active hold per evidence record is allowed.')
requireText(migration, 'revoke all on agent.evidence_legal_holds from anon, authenticated', 'Legal holds must not be directly writable by end-user roles.')
requireText(service, "hasProjectCapability(input.actorUserId, input.projectId, 'admin.manage')", 'Legal hold and retention mutations must be server-authorized.')
requireText(service, "Agent artifact is outside the requested project.", 'Artifact legal holds must enforce project scope.')
requireText(service, "Agent message is outside the requested project.", 'Message legal holds must enforce project scope.')
requireText(service, 'AUDIT_RECORD legal hold is fail-closed', 'Unwired audit-record legal holds must fail closed.')
requireText(service, 'if (retentionUntil > Date.now()) return true', 'Deletion must be blocked while retention is active.')
requireText(service, ".eq('active', true)", 'Deletion checks must honor active legal holds.')

console.log('Agent evidence retention and legal hold contract verified.')
