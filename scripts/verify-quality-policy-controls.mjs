import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const files = fs.readdirSync(migrationDir)
  .filter((name) => name.includes('quality') || name.includes('control'))
  .sort();
const sql = files.map((name) => fs.readFileSync(path.join(migrationDir, name), 'utf8')).join('\n');

const required = [
  'profiling.quality_rule_versions',
  'profiling.quality_rule_run_events',
  'quality_rule_versions_immutable',
  'quality_rule_run_events_immutable',
  'rule_version_id',
  "Executed quality rule version is immutable",
  'LEGACY_BASELINE_CAPTURED',
  "version_provenance'='LEGACY_BASELINE_CURRENT_DEFINITION'",
  'security_invoker=true',
  'governance.quality_exception_actor',
  'governance.control_waiver_actor',
  "actor_type in ('SYSTEM','USER')",
  'control_scope_catalog_active_unique',
  "target_state='STALE'",
  'discovered_asset_id=null',
  "c.review_status<>'APPROVED'",
  "c.authority_class='UNVERIFIED'",
  "Only approved active controls can receive an approved waiver",
  "'waiver_failure_semantics','OVERLAY_NOT_PASS'",
  'governance.verify_quality_control_posture()',
];

const forbidden = [
  /case\s+when\s+w\.id\s+is\s+not\s+null\s+then\s+['"]PASS['"]/i,
  /set\s+result\s*=\s*['"]PASS['"].*waiv/is,
  /grant\s+execute\s+on\s+function\s+(profiling|governance)\.(pin_quality_rule_run_version|capture_quality_rule_run_event|capture_quality_rule_exception_event|capture_control_waiver_event)[^;]*\s+to\s+(anon|authenticated|public)/i,
];

const failures = [];
for (const token of required) {
  if (!sql.includes(token)) failures.push(`missing contract token: ${token}`);
}
for (const pattern of forbidden) {
  if (pattern.test(sql)) failures.push(`forbidden Wave 2 authority/evidence pattern matched: ${pattern}`);
}

const hardening = fs.readFileSync(path.join(migrationDir, '20260906034500_harden_quality_control_history_contracts.sql'), 'utf8');
if (!/create trigger quality_rule_run_pin_version before insert or update on profiling\.quality_rule_runs/i.test(hardening)) {
  failures.push('quality runs are not guarded on every update');
}
if (!/new\.rule_version_id is distinct from old\.rule_version_id[\s\S]*raise exception 'Executed quality rule version is immutable/i.test(hardening)) {
  failures.push('re-execution can mutate the pinned semantic version');
}
if (!/foreign key\(rule_version_id\) references profiling\.quality_rule_versions\(id\) on delete restrict/i.test(hardening)) {
  failures.push('run to semantic-version history FK is not RESTRICT');
}
if (!/foreign key\(quality_rule_run_id\) references profiling\.quality_rule_runs\(id\) on delete restrict/i.test(hardening)) {
  failures.push('execution event history can be orphaned/deleted by parent removal');
}
if (!/status='APPROVED' and x\.expires_at>now\(\)/i.test(sql)) {
  failures.push('effective waiver semantics do not enforce expiry at read time');
}

const membershipFix = fs.readFileSync(path.join(migrationDir, '20260906040000_fix_control_waiver_membership.sql'), 'utf8');
if (/app_private\.is_project_member\s*\(\s*p_project_id\s*,\s*p_actor\s*\)/i.test(membershipFix)) {
  failures.push('effective request_control_waiver still calls the nonexistent two-argument RLS helper');
}
if (!/join app\.organization_members m on m\.organization_id=p\.organization_id/i.test(membershipFix) ||
    !/p\.id=p_project_id and m\.user_id=p_actor/i.test(membershipFix)) {
  failures.push('effective request_control_waiver does not validate the supplied actor against project organization membership');
}

if (failures.length) {
  console.error('Wave 2 Quality/Policy contract failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Wave 2 Quality/Policy contract passed across ${files.length} migration files.`);
