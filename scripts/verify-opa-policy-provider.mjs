import fs from 'node:fs'

const provider = fs.readFileSync('lib/governance/opa-policy-decision-provider.ts', 'utf8')
const factory = fs.readFileSync('lib/governance/governance-policy-decision-provider.ts', 'utf8')
const authz = fs.readFileSync('infra/opa/policy/authz.rego', 'utf8')
const decision = fs.readFileSync('infra/opa/policy/decision.rego', 'utf8')
const decisionTests = fs.readFileSync('infra/opa/policy/decision_test.rego', 'utf8')
const install = fs.readFileSync('infra/opa/install-opa.sh', 'utf8')
const build = fs.readFileSync('infra/opa/render-build.sh', 'utf8')
const start = fs.readFileSync('infra/opa/render-start.sh', 'utf8')

const required = [
  [provider, 'class OpaPolicyDecisionProvider', 'OPA provider class'],
  [provider, 'const canonical = await this.canonical.decide(request)', 'canonical decision first'],
  [provider, "if (canonical.decision === 'DENY') return canonical", 'canonical deny cannot be relaxed'],
  [provider, 'authorizationToken', 'OPA bearer credential option'],
  [provider, 'export function opaAuthorizationHeaders', 'shared OPA authorization header helper'],
  [provider, 'authorization: `Bearer ${token}`', 'OPA bearer credential construction'],
  [provider, 'this.authorizationHeaders = opaAuthorizationHeaders(options.authorizationToken)', 'OPA credential normalization'],
  [provider, '...this.authorizationHeaders', 'OPA bearer credential forwarding'],
  [provider, 'policy_version_id: canonical.policyVersionId', 'exact policy version sent to OPA'],
  [provider, 'opa.policy_version_id !== canonical.policyVersionId', 'stale OPA version rejected'],
  [provider, 'DECISION_RANK[opa.decision] < DECISION_RANK[canonical.decision]', 'OPA cannot weaken canonical decision'],
  [provider, 'failed closed', 'fail-closed external errors'],
  [factory, "selection !== 'governance' && selection !== 'opa'", 'closed provider selection'],
  [factory, 'process.env.OPA_URL', 'OPA endpoint configuration'],
  [factory, 'process.env.OPA_DECISION_PATH', 'OPA decision path configuration'],
  [factory, 'process.env.OPA_AUTH_TOKEN', 'OPA credential configuration'],
  [authz, 'default allow := false', 'OPA API deny-by-default authorization'],
  [authz, 'input.path == ["v1", "data", "datanexus", "autonomy", "decision"]', 'single authorized policy endpoint'],
  [authz, 'opa.runtime().env.OPA_AUTH_TOKEN', 'runtime-only OPA credential comparison'],
  [decision, 'canonical.authority_status in {"SYSTEM_BASELINE", "APPROVED"}', 'closed canonical authority allowlist'],
  [decision, '"policy_version_id": canonical.policy_version_id', 'OPA result exact version echo'],
  [decisionTests, 'test_preserves_system_baseline_decision', 'system baseline OPA behavior test'],
  [decisionTests, '"authority_status": "DRAFT"', 'non-authoritative OPA rejection test'],
  [install, 'OPA_VERSION:-v1.20.2', 'pinned OPA release'],
  [install, 'expected_hash=', 'upstream OPA checksum read'],
  [install, 'sha256sum "$artifact"', 'OPA binary checksum calculation'],
  [install, 'Checksum mismatch for ${artifact}', 'OPA checksum mismatch failure'],
  [build, 'test infra/opa/policy', 'Rego behavior tests'],
  [build, 'bundle.tar.gz', 'OPA policy bundle build'],
  [start, '--authentication=token', 'OPA token authentication'],
  [start, '--authorization=basic', 'OPA API authorization policy'],
  [start, ': "${OPA_AUTH_TOKEN:?OPA_AUTH_TOKEN is required}"', 'fail-closed runtime secret requirement'],
]

const failures = required
  .filter(([source, token]) => !source.includes(token))
  .map(([, , label]) => `missing ${label}`)

if (/authorizationToken\s*:\s*['"][^'"]+['"]/.test(factory)) {
  failures.push('OPA credential must not be embedded in the application factory')
}
if (/OPA_AUTH_TOKEN\s*[:=]\s*['"][^'"]+['"]/.test(authz)) {
  failures.push('OPA credential must not be embedded in Rego')
}
if (/canonical\.authority_status\s*==\s*["']APPROVED["']/.test(decision)) {
  failures.push('OPA must not reject valid SYSTEM_BASELINE canonical authority')
}
if (failures.length) {
  console.error('OPA policy provider verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('OPA policy provider, canonical authority allowlist, shared auth normalization, authenticated deployment, bundle, checksum, and fail-closed authority contracts verified.')
