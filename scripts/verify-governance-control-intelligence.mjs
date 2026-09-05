import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260905062116_governance_control_intelligence_engine.sql'
const gateMigrationPath = 'supabase/migrations/20260905062857_include_governance_control_intelligence_in_formal_gate.sql'
const issueProjectionPath = 'supabase/migrations/20260905063911_project_control_findings_into_governance_issues.sql'
const collectorMigrationPath = 'supabase/migrations/20260905064557_automated_governance_control_evidence_collection.sql'
const collectorFixPath = 'supabase/migrations/20260905064901_fix_automated_control_evidence_upsert_found_state.sql'
const continuousMigrationPath = 'supabase/migrations/20260905065604_continuous_governance_control_intelligence_reconciliation.sql'
const migration = fs.readFileSync(migrationPath, 'utf8')
const gateMigration = fs.readFileSync(gateMigrationPath, 'utf8')
const issueProjection = fs.readFileSync(issueProjectionPath, 'utf8')
const collectorMigration = fs.readFileSync(collectorMigrationPath, 'utf8')
const collectorFix = fs.readFileSync(collectorFixPath, 'utf8')
const continuousMigration = fs.readFileSync(continuousMigrationPath, 'utf8')
const aiGovernanceSweep = fs.readFileSync('lib/governance/ai-governance-intelligence.ts', 'utf8')
const workerRoute = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const vercelConfig = fs.readFileSync('vercel.json', 'utf8')
const files = {
  propose: fs.readFileSync('app/api/governance/controls/propose/route.ts', 'utf8'),
  review: fs.readFileSync('app/api/governance/controls/review/route.ts', 'utf8'),
  scope: fs.readFileSync('app/api/governance/controls/scope/route.ts', 'utf8'),
  evidence: fs.readFileSync('app/api/governance/controls/evidence/route.ts', 'utf8'),
  evaluate: fs.readFileSync('app/api/governance/controls/evaluate/route.ts', 'utf8'),
  refresh: fs.readFileSync('app/api/governance/controls/refresh/route.ts', 'utf8'),
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
  ['formal gate exposes control intelligence', /'governance_control_intelligence'/i.test(gateMigration)],
  ['formal gate detects browser DML', /browser_dml_exposed/i.test(gateMigration) && /role_table_grants/i.test(gateMigration)],
  ['formal gate detects lifecycle violations', /lifecycle_violations/i.test(gateMigration) && /authority_class='UNVERIFIED'/i.test(gateMigration)],
  ['formal gate distinguishes pending authority', /READY_PENDING_AUTHORITY/i.test(gateMigration)],
  ['formal gate counts implementation defects', /v_failure_count := v_failure_count \+ 1/i.test(gateMigration)],
  ['control finding projects to issue plane', /control_finding_id/i.test(issueProjection) && /trg_project_control_finding_to_issue/i.test(issueProjection)],
  ['projected control issues protected', /trg_protect_control_managed_issue/i.test(issueProjection) && /cannot be changed directly/i.test(issueProjection)],
  ['automated collector RPC', /governance\.refresh_governance_control_evidence/i.test(collectorMigration)],
  ['project control refresh RPC', /governance\.refresh_project_governance_control_intelligence/i.test(collectorMigration)],
  ['collector only evaluates active approved controls', /lifecycle_status<>'ACTIVE'.*review_status<>'APPROVED'/is.test(collectorMigration) && /lifecycle_status='ACTIVE'.*review_status='APPROVED'/is.test(collectorMigration)],
  ['collector uses authoritative postgres sources', /AUTHORITATIVE_POSTGRES_V1/i.test(collectorMigration) && /governance\.critical_data_elements/i.test(collectorMigration) && /governance\.accountability_assignments/i.test(collectorMigration) && /governance\.dataset_classifications/i.test(collectorMigration) && /governance\.lineage_column_mappings/i.test(collectorMigration) && /profiling\.profile_columns/i.test(collectorMigration)],
  ['attestation remains explicit', /event_type ilike '%ATTEST%'/i.test(collectorMigration)],
  ['collector reserves AUTO evidence namespace', /trg_protect_automated_control_evidence_key/i.test(collectorMigration) && /AUTO: governance control evidence keys are reserved/i.test(collectorMigration)],
  ['collector creates one stable evidence key per type and scope', /'AUTO:'\|\|v_type\|\|':'\|\|coalesce\(p_scope_binding_id::text,'PROJECT'\)/i.test(collectorMigration)],
  ['collector hashes source state', /source_latest_at/i.test(collectorMigration) && /extensions\.digest/i.test(collectorMigration)],
  ['collector supersedes stale evidence only', /status='SUPERSEDED'/i.test(collectorMigration) && /payload->>'collector'.*AUTHORITATIVE_POSTGRES_V1/is.test(collectorMigration)],
  ['collector preserves lookup FOUND state', /v_existing_found := found/i.test(collectorMigration) && /if v_existing_found then/i.test(collectorMigration)],
  ['collector FOUND regression guard', /v_existing_found/i.test(collectorFix) && /pg_get_functiondef/i.test(collectorFix)],
  ['collector RPC service-role boundary', /revoke execute on function governance\.refresh_governance_control_evidence[\s\S]*from public, anon, authenticated/i.test(collectorMigration) && /grant execute on function governance\.refresh_project_governance_control_intelligence[\s\S]*to service_role/i.test(collectorMigration)],
  ['all-project reconciliation RPC', /governance\.refresh_all_governance_control_intelligence/i.test(continuousMigration)],
  ['all-project reconciliation filters active approved controls', /lifecycle_status='ACTIVE'[\s\S]*review_status='APPROVED'[\s\S]*evaluation_method='EVIDENCE_ASSERTION'/i.test(continuousMigration)],
  ['all-project reconciliation isolates project errors', /exception when others/i.test(continuousMigration) && /PARTIAL_FAILURE/i.test(continuousMigration)],
  ['all-project reconciliation service-role boundary', /revoke execute on function governance\.refresh_all_governance_control_intelligence\(\)[\s\S]*from public, anon, authenticated/i.test(continuousMigration) && /grant execute on function governance\.refresh_all_governance_control_intelligence\(\)[\s\S]*to service_role/i.test(continuousMigration)],
  ['AI governance sweep invokes control reconciliation', /rpc\('refresh_all_governance_control_intelligence'\)/.test(aiGovernanceSweep) && /Promise\.all/.test(aiGovernanceSweep)],
  ['AI governance sweep propagates control failures', /failure_count/.test(aiGovernanceSweep) && /throw new Error\(`Governance control intelligence reconciliation reported/.test(aiGovernanceSweep)],
  ['scheduled worker invokes AI governance sweep', /refreshAllAIGovernanceIntelligence\(\)/.test(workerRoute)],
  ['worker runs every minute', /"path"\s*:\s*"\/api\/jobs\/worker"/.test(vercelConfig) && /"schedule"\s*:\s*"\* \* \* \* \*"/.test(vercelConfig)],
  ['proposal route calls RPC only', /rpc\('propose_governance_control'/.test(files.propose) && !/\.from\('control_definitions'\)/.test(files.propose)],
  ['review route calls RPC only', /rpc\('review_governance_control'/.test(files.review) && !/\.from\('control_definitions'\)/.test(files.review)],
  ['scope route calls RPC only', /rpc\('bind_governance_control_scope'/.test(files.scope)],
  ['evidence route calls RPC only', /rpc\('record_governance_control_evidence'/.test(files.evidence)],
  ['evaluate route calls RPC only', /rpc\('evaluate_governance_control'/.test(files.evaluate)],
  ['refresh route calls project refresh RPC only', /rpc\('refresh_project_governance_control_intelligence'/.test(files.refresh) && !/\.from\('control_evidence'\)/.test(files.refresh)],
  ['refresh route enforces agent execute', /authorizeProject\(user\.id, projectId, 'agent\.execute'\)/.test(files.refresh)],
  ['refresh route confirms database authorization', /database_capability_verified !== true/.test(files.refresh)],
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
