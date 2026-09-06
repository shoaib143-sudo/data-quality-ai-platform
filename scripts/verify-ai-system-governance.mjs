import fs from 'node:fs';
import path from 'node:path';
const file='20260906062000_govern_ai_systems.sql';
const sql=fs.readFileSync(path.join(process.cwd(),'supabase','migrations',file),'utf8');
const failures=[];
const required=[
  'governance.ai_systems','governance.ai_system_versions','governance.ai_system_decisions','governance.ai_system_assessments',
  'governance.register_ai_system_version','governance.record_ai_system_assessment','governance.review_ai_system_version',
  'governance.verify_ai_system_governance_posture()','READY_NO_REGISTERED_AI_SYSTEMS','HUMAN_POLICY_APPROVAL_REQUIRED_FOR_EXACT_CURRENT_AI_SYSTEM_VERSION',
  'NO_AUTOMATIC_DEPLOYMENT_AUTHORITY','security_invoker=true','policy.approve','on delete restrict','ai_system_versions_immutable','ai_system_decisions_immutable','ai_system_assessments_immutable'
];
for(const token of required) if(!sql.includes(token)) failures.push(`missing contract token: ${token}`);
const forbidden=[
  /grant\s+(insert|update|delete)[^;]+governance\.ai_systems[^;]+to\s+(anon|authenticated|service_role)/i,
  /grant\s+(insert|update|delete)[^;]+governance\.ai_system_versions[^;]+to\s+(anon|authenticated)/i,
  /grant\s+(insert|update|delete)[^;]+governance\.ai_system_decisions[^;]+to\s+(anon|authenticated)/i,
  /grant\s+(insert|update|delete)[^;]+governance\.ai_system_assessments[^;]+to\s+(anon|authenticated)/i,
  /on delete set null/i,
];
for(const re of forbidden) if(re.test(sql)) failures.push(`forbidden pattern: ${re}`);
if(!/before update or delete on governance\.ai_system_versions/i.test(sql)) failures.push('AI system versions not append-only');
if(!/before update or delete on governance\.ai_system_decisions/i.test(sql)) failures.push('AI system decisions not append-only');
if(!/before update or delete on governance\.ai_system_assessments/i.test(sql)) failures.push('AI system assessments not append-only');
if(!/lifecycle_status=case when v_decision='APPROVED' then 'ACTIVE' else 'DRAFT' end/i.test(sql)) failures.push('human decision does not control active lifecycle');
if(!/current_version_id=v_version_id,lifecycle_status='DRAFT'/i.test(sql)) failures.push('new version does not revoke active authority');
if(failures.length){console.error('Module 15 AI system governance contract failed:'); failures.forEach(f=>console.error(` - ${f}`)); process.exit(1);}
console.log('Module 15 AI system governance contract passed.');
