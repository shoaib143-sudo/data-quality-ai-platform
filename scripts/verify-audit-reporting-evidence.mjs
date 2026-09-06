import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(),'supabase','migrations','20260906050000_govern_audit_reporting_evidence.sql');
const sql = fs.readFileSync(file,'utf8');
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
];
for (const token of required) if (!sql.includes(token)) failures.push(`missing contract token: ${token}`);
const forbidden = [
  /grant\s+(insert|update|delete)[^;]+governance\.audit_report_snapshots[^;]+to\s+(anon|authenticated)/i,
  /grant\s+execute\s+on\s+function\s+governance\.generate_audit_report_snapshot[^;]+to\s+(anon|authenticated|public)/i,
  /on\s+delete\s+cascade[^;]*governance\.audit_events/i,
];
for (const re of forbidden) if (re.test(sql)) failures.push(`forbidden pattern: ${re}`);
if (!/create trigger audit_report_snapshots_immutable[\s\S]*before update or delete/i.test(sql)) failures.push('audit report snapshots are not append-only');
if (!/where e\.id=s\.chain_tip_event_id and e\.project_id=s\.project_id and e\.event_hash=s\.chain_tip_event_hash and e\.chain_sequence=s\.chain_sequence/i.test(sql)) failures.push('report chain anchor integrity check missing');
if (!/report_hash is distinct from governance\.compute_audit_report_hash/i.test(sql)) failures.push('report payload digest verification missing');
if (failures.length) {
  console.error('Module 11 audit/reporting contract failed:');
  failures.forEach((f)=>console.error(` - ${f}`));
  process.exit(1);
}
console.log('Module 11 audit/reporting contract passed.');
