import { personaSlugs } from '../lib/governance/personas.ts'
import {
  agentPolicyCapabilities,
  approvalRequirement,
  approvalSlaDays,
  evaluateRisk,
  mutatingAgentCapabilities,
  readOnlyAgentCapabilities,
} from '../lib/governance/agent-policy-v2.ts'
import {
  personaConversationDefaults,
  resolveConversationDefaults,
} from '../lib/governance/persona-conversation-defaults.ts'

const checks = []
function check(name, passed) { checks.push([name, Boolean(passed)]) }

check('Agent Policy v2 has unique capabilities', new Set(agentPolicyCapabilities).size === agentPolicyCapabilities.length)
check('read-only and mutating capability sets do not overlap', readOnlyAgentCapabilities.every(cap => !mutatingAgentCapabilities.includes(cap)))
check('all 13 personas have conversational defaults', personaSlugs.length === 13 && personaSlugs.every(slug => personaConversationDefaults[slug]))
check('approval SLA is 7/5/3/1 days', approvalSlaDays.LOW === 7 && approvalSlaDays.MEDIUM === 5 && approvalSlaDays.HIGH === 3 && approvalSlaDays.CRITICAL === 1)

const prodMaterial = approvalRequirement({
  environment: 'PRODUCTION',
  materialProductionMutation: true,
  businessCriticality: 'STANDARD',
  dataSensitivity: 'LOW',
  financialImpact: 'LOW',
  productionScope: 'LOW',
  reversibility: 'REVERSIBLE',
  computeCost: 'LOW',
})
check('material production mutation requires business approval', prodMaterial.requiresBusinessApproval)
check('material production mutation requires governance approval', prodMaterial.requiresGovernanceApproval)
check('break-glass is disabled', prodMaterial.breakGlassAllowed === false)
check('approval comments are mandatory', prodMaterial.commentRequired === true)
check('approval remains valid until execution subject to fingerprint validation', prodMaterial.approvalValidUntilExecution === true)

const nonProdCde = approvalRequirement({
  environment: 'NON_PRODUCTION',
  materialProductionMutation: false,
  businessCriticality: 'CDE',
  dataSensitivity: 'LOW',
  financialImpact: 'LOW',
  productionScope: 'LOW',
  reversibility: 'REVERSIBLE',
  computeCost: 'LOW',
})
check('non-production CDE work does not mandate dual approval', !nonProdCde.requiresBusinessApproval && !nonProdCde.requiresGovernanceApproval)
check('CDE sets at least HIGH risk floor', evaluateRisk({
  environment: 'NON_PRODUCTION',
  materialProductionMutation: false,
  businessCriticality: 'CDE',
  dataSensitivity: 'LOW',
  financialImpact: 'LOW',
  productionScope: 'LOW',
  reversibility: 'REVERSIBLE',
  computeCost: 'LOW',
}) === 'HIGH')
check('CDE material production mutation is CRITICAL', evaluateRisk({
  environment: 'PRODUCTION',
  materialProductionMutation: true,
  businessCriticality: 'CDE',
  dataSensitivity: 'LOW',
  financialImpact: 'LOW',
  productionScope: 'LOW',
  reversibility: 'REVERSIBLE',
  computeCost: 'LOW',
}) === 'CRITICAL')

const senior = resolveConversationDefaults('senior-leadership', null, { responseDepth: 'BALANCED' }, { responseDepth: 'DETAILED' })
check('user preference overrides project and persona conversational defaults', senior.responseDepth === 'DETAILED')
check('persona prompt defaults remain available when not overridden', senior.suggestedPrompts.length > 0)

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Agent Policy v2 verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`PASS Agent Policy v2 foundation (${checks.length} checks)`)
