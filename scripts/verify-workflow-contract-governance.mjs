import fs from 'node:fs';
import path from 'node:path';

const migrationDir = path.join(process.cwd(), 'supabase', 'migrations');
const file = path.join(migrationDir, '20260906043000_govern_workflow_and_data_contract_history.sql');
const sql = fs.readFileSync(file, 'utf8');
const failures = [];

const required = [
  'definition_snapshot jsonb',
  'workflow_instance_events',
  'workflow_actions_immutable',
  'guard_workflow_definition_history',
  "Workflow actor lacks required capability",
  "governance.has_project_capability(v_instance.project_id,p_actor_user_id,v_required_capability)",
  'remediation_outcome_events',
  'revoke insert,update,delete on governance.remediation_knowledge from authenticated',
  'authority_status text not null default \'UNVERIFIED\'',
  'data_contract_version_events',
  'guard_data_contract_version_history',
  'propose_data_contract_version',
  'review_data_contract_version',
  "governance.has_project_capability(c.project_id,p_reviewer,'policy.approve')",
  'data_contract_evaluation_events',
  'guard_data_contract_current_authority',
  'verify_workflow_contract_posture',
];
for (const token of required) if (!sql.includes(token)) failures.push(`missing contract: ${token}`);

const forbidden = [
  /grant\s+execute\s+on\s+function\s+governance\.(start_workflow|act_workflow|review_data_contract_version|propose_data_contract_version)[^;]*\s+to\s+(anon|authenticated|public)/i,
  /references\s+governance\.workflow_instances\(id\)\s+on\s+delete\s+cascade/i,
  /references\s+governance\.data_contract_versions\(id\)\s+on\s+delete\s+cascade/i,
  /status='ACTIVE'[^;]+authority_status='UNVERIFIED'/i,
];
for (const re of forbidden) if (re.test(sql)) failures.push(`forbidden pattern: ${re}`);

if (!/create trigger workflow_actions_immutable before update or delete/i.test(sql)) failures.push('workflow actions are not append-only');
if (!/create trigger data_contract_evaluation_events_immutable before update or delete/i.test(sql)) failures.push('contract evaluation history is not append-only');
if (!/Active data contract requires an approved effective current version/i.test(sql)) failures.push('active contract authority guard missing');
if (!/Used workflow definition semantics are immutable; create a new definition version/i.test(sql)) failures.push('workflow definition semantic immutability missing');

if (failures.length) {
  console.error('Wave 3 workflow/data-contract governance contract failed:');
  failures.forEach((f) => console.error(` - ${f}`));
  process.exit(1);
}
console.log('Wave 3 workflow/data-contract governance contract passed.');
