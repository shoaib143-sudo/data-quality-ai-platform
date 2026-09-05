import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260905062116_governance_control_intelligence_engine.sql'
const migration = fs.readFileSync(migrationPath, 'utf8')
const files = {
  propose: fs.readFileSync('app/api/governance/controls/propose/route.ts', 'utf8'),
  review: fs.readFileSync('app/api/governance/controls/review/route.ts', 'utf8'),
  scope: fs.readFileSync('app/api/governance/controls/scope/route.ts', 'utf8'),
  evidence: fs.readFileSync('app/api/governance/controls/evidence/route.ts', 'utf8'),
  evaluate: fs.readFileSync('app/api/governance/controls/evaluate/route.ts', 'utf8'),
}

const checks = [
  ['control definitions table', /create table governance\.control_definitions/i.test(migration)],
  ['requirement-control links', /create table governance\.requirement_control_links/i.test(migration)],
  ['scope bindings', /create table governance\.control_scope_bindings/i.test(migration)],
  ['control evidence', /create table governance\.control_evidence/i.test(migration)],
  ['control evaluations', /create table governance\.control_evaluations/i.test(migration)],
  ['governance findings', /create table governance\.governance_findings/i.test(migration)],
  ['proposal RPC', /governance\.propose_governance_control/i.test(migration)],
  ['review RPC', /governance\.review_governance_control/i.test(migration)],
  ['scope RPC', /governance\.bind_governance_control_scope/i.test(migration)],
  ['evidence RPC', /governance\.record_governance_control_evidence/i.test(migration)],
  ['evaluation RPC', /governance\.evaluate_governance_control/i.test(migration)],
  ['catalog capability enforced', /has_project_capability\(p_project_id,p_actor,'catalog\.update'\)/i.test(migration)],
  ['policy approval enforced', /has_project_capability\(p_project_id,p_reviewer,'policy\.approve'\)/i.test(migration)],
  ['agent execution enforced', /has_project_capability\(p_project_id,p_actor,'agent\.execute'\)/i.test(migration)],
  ['pending authority cannot activate', /cannot be activated until at least one linked requirement belongs to active eligible governance authority/i.test(migration)],
  ['enterprise authority requires approved active document', /d\.source_kind<>'SYNTHETIC'.*d\.status='ACTIVE'.*d\.review_status='APPROVED'/is.test(migration)],
  ['direct browser DML revoked', /revoke insert, update, delete on governance\.control_definitions[\s\S]*from public, anon, authenticated/i.test(migration)],
  ['source requirement invalidation trigger', /trg_invalidate_controls_on_requirement_change/i.test(migration)],
  ['source change forces pending reapproval', /lifecycle_status='PROPOSED',review_status='PENDING',authority_class='UNVERIFIED'/i.test(migration)],
  ['deterministic evidence assertion', /EVIDENCE_COUNT/i.test(migration)],
  ['evaluation input hash', /input_hash/i.test(migration) && /string_agg\(evidence_hash/i.test(migration)],
  ['evaluation idempotency', /reused',true/i.test(migration)],
  ['failure finding opens', /status='OPEN'/i.test(migration) || /'OPEN',v_control\.severity/i.test(migration)],
  ['pass resolves finding', /status='RESOLVED'/i.test(migration)],
  ['proposal audit atomic', /GOVERNANCE_CONTROL_PROPOSED/i.test(migration) && /atomic_with_control/i.test(migration)],
  ['review audit atomic', /GOVERNANCE_CONTROL_REVIEWED/i.test(migration) && /atomic_with_decision/i.test(migration)],
  ['evidence audit atomic', /GOVERNANCE_CONTROL_EVIDENCE_RECORDED/i.test(migration) && /atomic_with_evidence/i.test(migration)],
  ['evaluation audit atomic', /GOVERNANCE_CONTROL_EVALUATED/i.test(migration) && /atomic_with_evaluation/i.test(migration)],
  ['proposal route calls RPC only', /rpc\('propose_governance_control'/.test(files.propose) && !/\.from\('control_definitions'\)/.test(files.propose)],
  ['review route calls RPC only', /rpc\('review_governance_control'/.test(files.review) && !/\.from\('control_definitions'\)/.test(files.review)],
  ['scope route calls RPC only', /rpc\('bind_governance_control_scope'/.test(files.scope)],
  ['evidence route calls RPC only', /rpc\('record_governance_control_evidence'/.test(files.evidence)],
  ['evaluate route calls RPC only', /rpc\('evaluate_governance_control'/.test(files.evaluate)],
  ['proposal route confirms atomic state', /audit_atomic !== true/.test(files.propose) && /database_capability_verified !== true/.test(files.propose)],
  ['review route confirms governed state', /expectedLifecycle/.test(files.review) && /authority_class/.test(files.review)],
]

const failures = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Governance control intelligence verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`Governance control intelligence verification passed (${checks.length} checks).`)
