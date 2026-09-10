import { readFile } from 'node:fs/promises'

const migration = await readFile('supabase/migrations/20260910184500_dq_result_truth_and_sensitive_evidence.sql', 'utf8')
const architecture = await readFile('Architecture/2026-09-10-ADR-007-trusted-operational-governance-capability-model.md', 'utf8')

function all(source, tokens) {
  return tokens.every((token) => source.includes(token))
}

const canonicalStates = ['PASS', 'FAIL', 'NOT_MEASURED', 'UNAVAILABLE', 'ERROR', 'NOT_APPLICABLE', 'WAIVED']

const checks = [
  [canonicalStates.every((state) => architecture.includes(state)), 'ADR-007 declares explicit DQ result semantics'],
  [all(migration, ['add column if not exists result_state text', ...canonicalStates]), 'quality runs persist every canonical result state'],
  [all(migration, ['quality_rule_runs_result_consistency_check', "status='PASSED' and result_state='PASS'", "status='FAILED' and result_state='FAIL'", "status='ERROR' and result_state='ERROR'"]), 'binary and execution-error truth cannot drift'],
  [all(migration, ['NO_SOURCE_ROWS_AVAILABLE', "new.result_state := 'NOT_MEASURED'", 'new.passed := null']), 'empty evidence cannot silently pass'],
  [all(migration, ['REQUIRED_PROFILE_METRIC_NOT_PERSISTED', "new.result_state := 'UNAVAILABLE'", 'new.passed := null']), 'missing metrics are unavailable rather than pass/fail'],
  [all(migration, ['RULE_BOUND_TO_DIFFERENT_DATASET_VERSION', "new.result_state := 'NOT_APPLICABLE'"]), 'version-scoped rules fail safely as not applicable'],
  [all(migration, ['result_semantics', 'CANONICAL']), 'canonical result semantics are recorded in evidence'],
  [all(migration, ['redact_governed_sensitive_sample', 'dataset_classifications', 'classification_labels', "authority_state='AUTHORITATIVE'", "status='APPROVED'", "target_state='CURRENT'"]), 'redaction is driven by current authoritative classification'],
  [all(migration, ['quality_exception_sensitive_evidence', "new.observed_value := '[REDACTED]'", "new.record_key := 'sha256:'"]), 'row-level exceptions redact values and hash sensitive record keys'],
  [all(migration, ['quarantine_sensitive_evidence', 'redact_governed_sensitive_sample(new.dataset_id,new.sample)']), 'quarantine evidence is redacted at the database boundary'],
  [all(migration, ['on_quality_rule_outcome', "'result_state',new.result_state", "new.result_state='FAIL'"]), 'governance events and certification invalidation use canonical result truth'],
  [all(migration, ['verify_quality_result_truth_posture', "'execution_error_is_quality_result',false", "'authoritative_classification_drives_redaction',true"]), 'production posture is executable'],
  [all(migration, ['revoke execute on function profiling.normalize_quality_rule_result_truth()', 'revoke execute on function profiling.protect_quality_exception_sensitive_evidence()', 'revoke execute on function profiling.protect_quarantine_sensitive_evidence()']), 'internal enforcement functions are not client-callable'],
]

for (const [passed, label] of checks) {
  if (!passed) throw new Error(`DQ result truth contract failed: ${label}`)
  console.log(`PASS ${label}`)
}

console.log('DQ result truth and sensitive evidence verification completed.')
