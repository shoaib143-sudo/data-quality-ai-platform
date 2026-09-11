import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function requireText(source, text, label) {
  if (!source.includes(text)) throw new Error(`Missing ${label}: ${text}`)
}

const automation = read('lib/data-quality/automation.ts')
const resumable = read('lib/agents/resumable-run-step.ts')
const kernel = read('lib/agents/runtime/native-autonomy-kernel.ts')
const migration = read('supabase/migrations/20260911235000_data_quality_native_replay_certification.sql')

requireText(resumable, 'attempt: Number(existing.attempt ?? 1)', 'persisted attempt read')
requireText(resumable, 'const attempt = Number(existing.attempt ?? 1) + 1', 'retry attempt increment')

for (const toolKey of ['sync_quality_rules', 'execute_quality_rules', 'publish_quality_results']) {
  requireText(automation, `toolKey: '${toolKey}'`, `${toolKey} native admission`)
}
requireText(automation, 'completeNativeToolInvocation', 'native completion')
requireText(automation, 'failNativeToolInvocation', 'native failure recording')
requireText(automation, "onConflict: 'agent_run_id,rule_definition_id,profile_run_id'", 'rule-run replay upsert')
requireText(automation, "onConflict: 'quality_rule_run_id,record_hash,column_name'", 'exception replay upsert')
requireText(automation, "onConflict: 'quality_rule_run_id,record_hash'", 'quarantine replay upsert')
requireText(automation, 'materialPayloadMatches', 'no-op rule sync suppression')
requireText(automation, 'if (!publishStep.alreadySucceeded)', 'publish resume guard')

requireText(kernel, '&& certification.idempotent\n    && certification.replayCertified', 'Tier 2 replay certification requirement')

for (const indexName of [
  'quality_rule_runs_replay_identity_uidx',
  'quality_rule_exceptions_replay_identity_uidx',
  'quality_quarantine_records_replay_identity_uidx',
]) {
  requireText(migration, indexName, `${indexName} migration`)
}
requireText(migration, 'preserve_quality_rule_run_replay_timestamp', 'stable replay timestamp guard')
requireText(migration, "event_type,\n    run_snapshot", 'quality run event rewrite')
requireText(migration, "'replay_certified', true", 'certified DQ contracts')
requireText(migration, "version = '1.1'", 'DQ contract version bump')

console.log('Data Quality native replay guardrails verified.')
