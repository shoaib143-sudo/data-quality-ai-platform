import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(),'supabase','migrations','20260906052000_govern_ai_assisted_governance.sql');
const sql = fs.readFileSync(file,'utf8');
const failures = [];
const required = [
  'governance.ai_governance_suggestions',
  'governance.ai_governance_suggestion_decisions',
  'ai_governance_suggestions_immutable',
  'ai_governance_suggestion_decisions_immutable',
  'governance.record_ai_governance_suggestion',
  'governance.review_ai_governance_suggestion',
  'governance.ai_suggestion_review_capability',
  "'classification.review'",
  "'quality.manage'",
  "'glossary.manage'",
  "'stewardship.manage'",
  "'policy.approve'",
  "'contract.approve'",
  "'workflow.manage'",
  'NO_AUTOMATIC_GOVERNANCE_MUTATION',
  'security_invoker=true',
  'governance.verify_ai_assisted_governance_posture()',
];
for (const token of required) if (!sql.includes(token)) failures.push(`missing contract token: ${token}`);
const forbidden = [
  /grant\s+(insert|update|delete)[^;]+governance\.ai_governance_suggestions[^;]+to\s+(anon|authenticated)/i,
  /grant\s+(insert|update|delete)[^;]+governance\.ai_governance_suggestion_decisions[^;]+to\s+(anon|authenticated)/i,
  /grant\s+execute\s+on\s+function\s+governance\.review_ai_governance_suggestion[^;]+to\s+(anon|authenticated|public)/i,
  /update\s+governance\.(control_definitions|data_contracts|dataset_classifications|ownership_assignments|workflow_instances)/i,
];
for (const re of forbidden) if (re.test(sql)) failures.push(`forbidden pattern: ${re}`);
if (!/before update or delete on governance\.ai_governance_suggestions/i.test(sql)) failures.push('AI suggestions are not immutable');
if (!/before update or delete on governance\.ai_governance_suggestion_decisions/i.test(sql)) failures.push('AI review decisions are not immutable');
if (!/AI_SUGGESTION_SEPARATE_FROM_HUMAN_GOVERNANCE_AUTHORITY/.test(sql)) failures.push('authority separation contract missing');
if (!/revoke insert,update,delete on agent\.agent_runs from anon,authenticated/i.test(sql)) failures.push('browser agent run mutation is not revoked');
if (failures.length) {
  console.error('Module 12 AI-assisted governance contract failed:');
  failures.forEach((f)=>console.error(` - ${f}`));
  process.exit(1);
}
console.log('Module 12 AI-assisted governance contract passed.');
