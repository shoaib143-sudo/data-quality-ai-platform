import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260910232000_v5_reconcile_operational_and_canonical_outcomes.sql', 'utf8')
const bridge = fs.readFileSync('lib/governance/governed-action-outcome-authority.ts', 'utf8')
const route = fs.readFileSync('app/api/governance/autonomy/route.ts', 'utf8')
const operational = fs.readFileSync('lib/governance/governed-action-outcomes.ts', 'utf8')
const canonical = fs.readFileSync('lib/governance/governed-outcome-learning.ts', 'utf8')

const checks = [
  ['operational state links immutable canonical evidence', migration.includes('canonical_outcome_id uuid') && migration.includes('references governance.governed_action_outcomes')],
  ['operational and canonical semantics are explicitly separated', migration.includes('Mutable operational verification state') && migration.includes('immutable governance.governed_action_outcomes')],
  ['parallel operational FK gaps are covered', migration.includes('autonomy_action_outcomes_issue_idx') && migration.includes('autonomy_action_outcomes_verified_by_idx')],
  ['canonical promotion uses one action-idempotent case', migration.includes("v_case_key := 'autonomy-action:' || v_outcome.autonomy_action_id::text")],
  ['canonical promotion rejects provenance collision', migration.includes('existing learning case provenance does not match canonical governed outcome')],
  ['canonical promotion upgrades case authority evidence', migration.includes("'authority','IMMUTABLE_GOVERNED_ACTION_OUTCOME'") && migration.includes("'governed_action_outcome_id',v_outcome.id")],
  ['operational-only autonomy cases are excluded from learning search', migration.includes("lc.source_kind <> 'AUTONOMY_ACTION_OUTCOME'") && migration.includes("lc.evidence ? 'governed_action_outcome_id'")],
  ['operational verifier retains asynchronous states', operational.includes("type OutcomeStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'UNKNOWN'")],
  ['bridge snapshots only terminal verification state', bridge.includes("!['VERIFIED', 'FAILED'].includes(status)")],
  ['bridge records through immutable canonical RPC provider', bridge.includes('recordGovernedActionOutcome') && bridge.includes("verificationKey: `operational:${outcome.id}`")],
  ['bridge promotes through immutable canonical authority', bridge.includes('promoteVerifiedGovernedActionOutcome')],
  ['bridge links operational state to canonical outcome', bridge.includes('canonical_outcome_id: canonicalOutcome.id')],
  ['verified execution carries before and after evidence', bridge.includes('beforeEvidence: verified ? effectiveBefore : beforeState') && bridge.includes('afterEvidence: afterState')],
  ['future learning remains independently reauthorized', canonical.includes('future_action_reauthorization_required: true')],
  ['API cannot call mutable verifier as final authority', route.includes('verifyAndCanonicalizeGovernedActionOutcome') && !route.includes("from '@/lib/governance/governed-action-outcomes'")],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed]) of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`V5 outcome authority reconciliation failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`V5 outcome authority reconciliation passed (${checks.length} checks).`)
