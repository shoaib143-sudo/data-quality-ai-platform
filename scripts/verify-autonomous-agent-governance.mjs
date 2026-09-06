import fs from 'node:fs';
import path from 'node:path';
const sql=fs.readFileSync(path.join(process.cwd(),'supabase','migrations','20260906060000_govern_autonomous_agent_actions.sql'),'utf8');
const failures=[];
const required=[
 'governance.autonomy_policy_versions','current_version_id','LEGACY_BASELINE_CURRENT_POLICY','governance.autonomy_action_events',
 'LEGACY_CURRENT_STATE_NOT_FULL_HISTORY','autonomy_policy_versions_immutable','autonomy_action_events_immutable',
 'governance.enforce_autonomy_action_policy','EXACT_APPROVED_AUTONOMY_ACTION_WORKFLOW_REQUIRED',"upper(w.entity_type)='AUTONOMY_ACTION'",
 "w.status='APPROVED'",'governance.configure_autonomy_policy',"'policy.approve'",'UPDATE_QUALITY_RULE_THRESHOLD','MUTATE_SOURCE_DATA','ALTER_SCHEMA','DELETE_DATA',
 'production_source_mutation','governance.verify_autonomous_agent_posture()','policy_version_id','on delete restrict'
];
for(const token of required) if(!sql.includes(token)) failures.push(`missing contract token: ${token}`);
const forbidden=[
 /grant\s+(insert|update|delete)[^;]+governance\.autonomy_policy_versions[^;]+to\s+(anon|authenticated)/i,
 /grant\s+(insert|update|delete)[^;]+governance\.autonomy_action_events[^;]+to\s+(anon|authenticated)/i,
 /grant\s+(insert|update|delete)[^;]+governance\.autonomy_policies[^;]+to\s+(anon|authenticated)/i,
 /on delete set null/i,
];
for(const re of forbidden) if(re.test(sql)) failures.push(`forbidden pattern: ${re}`);
if(!/before update or delete on governance\.autonomy_policy_versions/i.test(sql)) failures.push('policy versions not append-only');
if(!/before update or delete on governance\.autonomy_action_events/i.test(sql)) failures.push('action history not append-only');
if(!/before insert or update[^\n]*on governance\.autonomy_actions/i.test(sql)) failures.push('autonomy action enforcement trigger missing');
if(!/revoke insert,update,delete,truncate on governance\.autonomy_policies from service_role/i.test(sql)) failures.push('direct service policy mutation remains exposed');
if(failures.length){console.error('Module 14 autonomous governance contract failed:'); failures.forEach(f=>console.error(` - ${f}`)); process.exit(1);} 
console.log('Module 14 autonomous governance contract passed.');
