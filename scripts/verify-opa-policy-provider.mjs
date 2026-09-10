import fs from 'node:fs'

const provider = fs.readFileSync('lib/governance/opa-policy-decision-provider.ts', 'utf8')
const factory = fs.readFileSync('lib/governance/governance-policy-decision-provider.ts', 'utf8')

const required = [
  [provider, 'class OpaPolicyDecisionProvider', 'OPA provider class'],
  [provider, 'const canonical = await this.canonical.decide(request)', 'canonical decision first'],
  [provider, "if (canonical.decision === 'DENY') return canonical", 'canonical deny cannot be relaxed'],
  [provider, "policy_version_id: canonical.policyVersionId", 'exact policy version sent to OPA'],
  [provider, "opa.policy_version_id !== canonical.policyVersionId", 'stale OPA version rejected'],
  [provider, "DECISION_RANK[opa.decision] < DECISION_RANK[canonical.decision]", 'OPA cannot weaken canonical decision'],
  [provider, 'failed closed', 'fail-closed external errors'],
  [factory, "selection !== 'governance' && selection !== 'opa'", 'closed provider selection'],
  [factory, 'process.env.OPA_URL', 'OPA endpoint configuration'],
  [factory, 'process.env.OPA_DECISION_PATH', 'OPA decision path configuration'],
]

const failures = required.filter(([source, token]) => !source.includes(token)).map(([, , label]) => `missing ${label}`)
if (/authorization\s*:\s*[`'"]Bearer/i.test(provider)) failures.push('OPA provider must not invent or embed bearer credentials in source')
if (failures.length) {
  console.error('OPA policy provider verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('OPA policy provider authority and fail-closed contracts verified.')
