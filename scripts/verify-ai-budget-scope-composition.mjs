import fs from 'node:fs'

const adr = fs.readFileSync('Architecture/2026-09-10-ADR-008-ai-resource-budget-scope-composition.md', 'utf8')
const types = fs.readFileSync('lib/ai/reasoning-budget-policy.ts', 'utf8')
const resolver = fs.readFileSync('lib/ai/governance-reasoning-budget-policy.ts', 'utf8')
const router = fs.readFileSync('lib/ai/observable-intelligent-router.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260910185600_generalize_ai_budget_admission_scope.sql', 'utf8')
const provider = fs.readFileSync('lib/ai/reasoning-provider.ts', 'utf8')

const checks = [
  ['ADR explicitly rejects scope precedence', /No scope has precedence over another/i.test(adr)],
  ['ADR preserves no-estimated-cost rule', /must not estimate token usage or invent a quote/i.test(adr)],
  ['budget context carries AI system and agent identities', /aiSystemId\?: string \| null/.test(types) && /agentDefinitionId\?: string \| null/.test(types)],
  ['resolver matches project scope exactly', /scope_type === 'PROJECT'.*scope_key === 'PROJECT'/s.test(resolver)],
  ['resolver matches AI system by explicit identity', /scope_type === 'AI_SYSTEM'.*context\.aiSystemId/s.test(resolver)],
  ['resolver matches agent by explicit identity', /scope_type === 'AGENT'.*context\.agentDefinitionId/s.test(resolver)],
  ['composed request ceiling uses minimum constraint', /Math\.min\(\.\.\.concrete\)/.test(resolver)],
  ['runtime resolves composed budget after routed identity is known', /resolveBudget\(\{[\s\S]*aiSystemId: this\.context\.aiSystemId[\s\S]*agentDefinitionId: this\.context\.agentDefinitionId/.test(router)],
  ['runtime admits each applicable rate/concurrency policy', /for \(const policy of admissionPolicies\)/.test(router)],
  ['runtime releases leases on denied composed admission', /await releaseAdmissionLeases\(\)[\s\S]*throw admissionDeniedError/.test(router)],
  ['database admission no longer hardcodes PROJECT scope', !/effective\.scope_type = 'PROJECT'/.test(migration) && !/effective\.scope_key = 'PROJECT'/.test(migration)],
  ['database still requires exact current policy version', /effective\.id = p_policy_version_id/.test(migration)],
  ['reasoning provider has no preflight exact cost quote contract', !/preflight.*cost|quote.*cost/i.test(provider)],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failed.length) process.exit(1)
