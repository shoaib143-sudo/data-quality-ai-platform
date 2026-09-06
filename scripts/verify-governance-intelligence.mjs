import fs from 'node:fs';
import path from 'node:path';

const files = [
  '20260906054000_governance_intelligence_history.sql',
  '20260906054100_govern_risk_prediction_authority.sql',
].map((name)=>fs.readFileSync(path.join(process.cwd(),'supabase','migrations',name),'utf8'));
const sql = files.join('\n');
const failures=[];
const required=[
  'governance.governance_risk_prediction_events',
  'governance_risk_prediction_events_immutable',
  'governance.capture_governance_risk_prediction_event',
  'LEGACY_CURRENT_BASELINE_NOT_FULL_HISTORY',
  'rules-v2-governed-authority',
  'ACTIVE_CURRENT_VERSION_APPROVED_EFFECTIVE_ONLY',
  "dcv.authority_status='APPROVED'",
  'dcv.approved_by is not null',
  'dcv.id=dc.current_version_id',
  'REAL_FIELD_LINEAGE_DATA_NOT_INGESTED',
  'governance.verify_governance_intelligence_posture()',
  'TRANSPARENT_RULES_V2_GOVERNED_AUTHORITY',
];
for(const token of required) if(!sql.includes(token)) failures.push(`missing contract token: ${token}`);
const forbidden=[
  /upper\(coalesce\(dc\.status,'ACTIVE'\)\) not in \('RETIRED','ARCHIVED'\)/i,
  /dcv\.contract_id=dc\.id/i,
  /grant\s+(insert|update|delete)[^;]+governance\.governance_risk_prediction_events[^;]+to\s+(anon|authenticated)/i,
];
for(const re of forbidden) if(re.test(sql)) failures.push(`forbidden pattern: ${re}`);
if(!/after insert or update on governance\.governance_risk_predictions/i.test(sql)) failures.push('risk prediction refresh history trigger missing');
if(!/before update or delete on governance\.governance_risk_prediction_events/i.test(sql)) failures.push('risk prediction history is not append-only');
if(!/model_hash is distinct from encode\(extensions\.digest/i.test(sql)) failures.push('history digest verification missing');
if(failures.length){
  console.error('Module 13 governance intelligence contract failed:');
  failures.forEach((f)=>console.error(` - ${f}`));
  process.exit(1);
}
console.log('Module 13 governance intelligence contract passed.');
