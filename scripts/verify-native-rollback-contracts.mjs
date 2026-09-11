import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const kernel = readFileSync('lib/agents/runtime/native-autonomy-kernel.ts','utf8')
const rollback = readFileSync('lib/agents/runtime/native-rollback-contract.ts','utf8')
const recovery = readFileSync('lib/agents/runtime/native-recovery-v2.ts','utf8')
const migration = readFileSync('supabase/migrations/20260912033000_native_rollback_compensation_contracts.sql','utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

contains(rollback, "export type NativeRollbackStrategy = 'NOT_APPLICABLE' | 'COMPENSATION_TOOL' | 'ESCALATE_ONLY'", 'rollback strategy vocabulary')
contains(rollback, "optionalString(config, toolKey, 'rollback_strategy')", 'pinned rollback strategy binding')
contains(rollback, "mutating tool requires rollback_strategy COMPENSATION_TOOL or ESCALATE_ONLY", 'missing mutation rollback fail closed')
contains(rollback, "COMPENSATION_TOOL requires compensation_tool_key", 'compensation tool requirement')
contains(rollback, "COMPENSATION_TOOL requires compensatable=true", 'compensatable requirement')
contains(rollback, "ESCALATE_ONLY cannot claim reversible/compensatable execution or a compensation tool", 'escalation contradiction guard')
contains(kernel, 'certifyNativeRollbackContract', 'kernel rollback contract integration')
contains(kernel, "certification.rollbackStrategy === 'COMPENSATION_TOOL'", 'Tier 1 compensation contract gate')

contains(recovery, "certification.rollbackStrategy === 'COMPENSATION_TOOL'", 'Recovery V2 compensation strategy routing')
contains(recovery, "certification.rollbackStrategy === 'ESCALATE_ONLY'", 'Recovery V2 escalation strategy routing')
contains(recovery, "'ROLLBACK_ESCALATION_REQUIRED'", 'explicit escalation terminal code')
contains(recovery, "'ROLLBACK_CONTRACT_MISSING'", 'missing rollback fail-closed code')

for (const tool of [
  'sync_quality_rules','execute_quality_rules','publish_quality_results',
  'profile_dataset','execute_metrics','investigate_profile','compare_profiles',
  'persist_profile_snapshot','complete_profile_run',
]) contains(migration, `'${tool}'`, `${tool} rollback contract`)

contains(migration, "'rollback_strategy','ESCALATE_ONLY'", 'evidence mutation escalation-only policy')
contains(migration, "'reversible',false", 'non-reversible evidence contract')
contains(migration, "'compensatable',false", 'non-compensatable evidence contract')
contains(migration, "if v_expected <> 9 then", 'nine mutation postcondition')
contains(migration, "if v_invalid <> 0 then", 'contradictory rollback postcondition')
contains(migration, "if v_missing <> 0 then", 'missing rollback postcondition')

console.log('Native rollback and compensation contracts verified.')
