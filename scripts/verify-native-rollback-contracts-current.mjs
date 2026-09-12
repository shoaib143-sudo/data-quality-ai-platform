import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const rollback = readFileSync('lib/agents/runtime/native-rollback-contract.ts', 'utf8')
const kernel = readFileSync('lib/agents/runtime/native-autonomy-kernel.ts', 'utf8')
const recovery = readFileSync('lib/agents/runtime/native-recovery-v2.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260912103000_native_rollback_compensation_contracts.sql', 'utf8')
const rollbackTests = readFileSync('scripts/test-native-rollback-contracts.mjs', 'utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

contains(rollback, "'NOT_APPLICABLE' | 'COMPENSATION_TOOL' | 'ESCALATE_ONLY'", 'rollback strategy vocabulary')
contains(rollback, "optionalString(config, toolKey, 'rollback_strategy')", 'rollback strategy pinning')
contains(rollback, 'COMPENSATION_TOOL requires compensation_tool_key', 'compensation-key guard')
contains(rollback, 'COMPENSATION_TOOL requires compensatable=true', 'compensatable guard')
contains(rollback, 'ESCALATE_ONLY cannot claim reversible/compensatable execution or a compensation tool', 'escalation contradiction guard')

contains(kernel, 'certifyNativeRollbackContract', 'kernel rollback certification')
contains(kernel, 'rollbackStrategy: NativeRollbackStrategy', 'certification rollback field')
contains(kernel, "certification.rollbackStrategy === 'COMPENSATION_TOOL'", 'Tier 1 rollback gate')
contains(kernel, '&& certification.compensatable', 'Tier 1 compensatable gate')
contains(kernel, 'allowTier2AutomaticExecution', 'Tier 2 explicit preapproval preserved')

const recoveryCertification = recovery.indexOf('replayCertifiedFromPinnedContract(contract)')
const compensationBranch = recovery.indexOf('if (contract.execution_config.compensation_tool_key)', recoveryCertification)
assert.ok(recoveryCertification >= 0, 'Recovery V2 must re-certify the pinned failed tool contract')
assert.ok(compensationBranch > recoveryCertification, 'Recovery V2 may inspect compensation metadata for a recovery decision only after pinned rollback certification')
contains(recovery, 'executeVerifiedCompensation', 'verified compensation execution path')
contains(recovery, 'verifyCompensationInvocation', 'compensation evidence verification')

contains(migration, "then 'NOT_APPLICABLE'", 'read-only rollback assignment')
contains(migration, "else 'ESCALATE_ONLY'", 'mutation escalation assignment')
contains(migration, 'refuses to infer contracts', 'ambiguous rollback fail-closed precondition')
contains(migration, 'This migration must not invent compensation tools', 'no invented compensation postcondition')
contains(migration, 'Expected every enabled tool to have rollback_strategy', 'complete rollback coverage postcondition')

contains(rollbackTests, 'certifyNativeRollbackContract', 'rollback contract tests')
contains(rollbackTests, "rollbackStrategy: 'NOT_APPLICABLE'", 'read-only test')
contains(rollbackTests, "rollbackStrategy: 'COMPENSATION_TOOL'", 'compensation test')
contains(rollbackTests, "rollbackStrategy: 'ESCALATE_ONLY'", 'escalation test')

console.log('Current native rollback and compensation contracts verified.')
