import fs from 'node:fs';
import path from 'node:path';

const baseFile = path.join(process.cwd(),'supabase','migrations','20260906050000_govern_audit_reporting_evidence.sql');
const hardeningFile = path.join(process.cwd(),'supabase','migrations','20260908113000_harden_non_lineage_enterprise_acceptance.sql');
const baseSql = fs.readFileSync(baseFile,'utf8');
const hardeningSql = fs.readFileSync(hardeningFile,'utf8');
const sql = `${baseSql}\n${hardeningSql}`;
const failures = [];
const required = [
  'governance.audit_report_snapshots',
  'audit_report_snapshots_immutable',
  'governance.compute_audit_report_hash',
  'governance.generate_audit_report_snapshot',
  "GOVERNANCE_AUDIT_REPORT_GENERATED",
  'chain_tip_event_hash',
  'chain_sequence',
  'governance.verify_audit_chain(p_project_id)',
  'governance.verify_governance_audit_posture()',
  'governance.verify_database_api_security_posture()',
  "'real_field_lineage_data_not_ingested',true",
  "'real_governance_corpus_not_ingested',true",
  "'synthetic_governance_authority_claimed',false",
  'governance.verify_audit_reporting_posture()',
  'alter table governance.audit_events alter column chain_version set default 3',
  'new.chain_version := 3',
  'where chain_version = 2',
  "'v2_forks_observed'",
  'where chain_version >= 3',
  "'chain_version',3",
];
for (const token of required) if (!sql.includes(token)) failures.push(`missing contract token: ${token}`);
const forbidden = [
  /grant\s+(insert|update|delete)[^;]+governance\.audit_report_snapshots[^;]+to\s+(anon|authenticated)/i,
  /grant\s+execute\s+on\s+function\s+governance\.generate_audit_report_snapshot[^;]+to\s+(anon|authenticated|public)/i,
  /on\s+delete\s+cascade[^;]*governance\.audit_events/i,
  /update\s+governance\.audit_events/i,
  /delete\s+from\s+governance\.audit_events/i,
];
for (const re of forbidden) if (re.test(hardeningSql)) failures.push(`forbidden hardening pattern: ${re}`);
if (!/create trigger audit_report_snapshots_immutable[\s\S]*before update or delete/i.test(baseSql)) failures.push('audit report snapshots are not append-only');
if (!/where e\.id=s\.chain_tip_event_id and e\.project_id=s\.project_id and e\.event_hash=s\.chain_tip_event_hash and e\.chain_sequence=s\.chain_sequence/i.test(baseSql)) failures.push('report chain anchor integrity check missing');
if (!/report_hash is distinct from governance\.compute_audit_report_hash/i.test(baseSql)) failures.push('report payload digest verification missing');
if (!/v2 was deployed before project-scoped advisory serialization[\s\S]*r\.event_hash is distinct from v_expected[\s\S]*p\.event_hash = r\.previous_hash/i.test(hardeningSql)) failures.push('v2 historical evidence is not verified by stored digest and predecessor');
if (!/v3\+ is strictly serialized[\s\S]*r\.previous_hash is distinct from v_prev[\s\S]*r\.event_hash is distinct from v_expected/i.test(hardeningSql)) failures.push('v3 strict linear verification missing');
if (!/pg_advisory_xact_lock/i.test(hardeningSql)) failures.push('v3 writer serialization lock missing');
if (failures.length) {
  console.error('Module 11 audit/reporting contract failed:');
  failures.forEach((f)=>console.error(` - ${f}`));
  process.exit(1);
}
console.log('Module 11 audit/reporting contract passed.');
