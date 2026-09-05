import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing specialist governance intelligence artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}

const ai = read('lib/governance/ai-governance-intelligence.ts')
const context = read('lib/agents/governance-intelligence-specialist-context.ts')
const brief = read('lib/governance/governance-intelligence-brief.ts')
const direct = read('app/api/agents/governance/run/route.ts')
const handoff = read('app/api/agents/governance/handoff/route.ts')
const worker = read('lib/agents/governance-job-worker.ts')

const checks = [
  ['shared enrichment remains used by direct specialist run', /enrichOutputWithAIGovernanceIntelligence\(projectId, specialistOutput\)/.test(direct)],
  ['shared enrichment remains used by specialist handoff', /enrichOutputWithAIGovernanceIntelligence\(projectId, specialistOutput\)/.test(handoff)],
  ['shared enrichment remains used by durable specialist worker', /enrichOutputWithAIGovernanceIntelligence\(projectId, specialistOutput\)/.test(worker)],
  ['shared enrichment loads deterministic governance brief for agent outputs', /buildGovernanceIntelligenceBrief/.test(ai) && /composeSpecialistOutputWithGovernanceIntelligence/.test(ai)],
  ['non-agent enrichment remains backward compatible', /if \(!agent \|\| typeof agent !== 'object' \|\| Array\.isArray\(agent\)\) return base/.test(ai)],
  ['specialist composition explicitly marks intelligence consumed', /governanceIntelligenceConsumed:\s*true/.test(context)],
  ['specialist reasoning requires active approved authority', /Only AUTHORITATIVE_ACTIVE controls may support authoritative control conclusions/.test(context) && /controlAuthorityRule:\s*'ACTIVE_AND_APPROVED_ONLY'/.test(context)],
  ['specialist reasoning labels proposals non-authoritative', /PROPOSED_NON_AUTHORITATIVE controls are proposals only/.test(context)],
  ['specialist reasoning cannot infer away formal blockers', /Formal blockers from the database verifier are readiness constraints and must not be inferred away/.test(context)],
  ['specialist reasoning prohibits missing-artifact fabrication', /Do not fabricate missing enterprise policy approval, provenance, attestation, transformation lineage, evidence, or ownership/.test(context)],
  ['specialist evidence order includes governance intelligence brief', /GOVERNANCE_INTELLIGENCE_BRIEF/.test(context)],
  ['specialist recommendations retain deterministic persisted-state authority', /DETERMINISTIC_PERSISTED_STATE/.test(context)],
  ['specialist recommendations are role-filtered', /roleRecommendationCodes/.test(context) && /steward_agent/.test(context) && /architect_agent/.test(context) && /investigator_agent/.test(context) && /executive_agent/.test(context)],
  ['specialist context keeps formal enterprise authority blocker', /REAL_GOVERNANCE_CORPUS_NOT_INGESTED/.test(context)],
  ['specialist context keeps formal field lineage blocker', /REAL_FIELD_LINEAGE_DATA_NOT_INGESTED/.test(context)],
  ['specialist context includes control findings and evaluation attention', /OPEN_GOVERNANCE_CONTROL_FINDINGS/.test(context) && /CONTROL_EVALUATION_ATTENTION/.test(context)],
  ['specialist context is bounded', /authoritativeActiveControls:[\s\S]*slice\(0, 50\)/.test(context) && /latestEvaluations:[\s\S]*slice\(0, 100\)/.test(context) && /openFindings:[\s\S]*slice\(0, 100\)/.test(context)],
  ['specialist context does not query raw control evidence', !/from\('control_evidence'\)/.test(context) && !/control_evidence/.test(context)],
  ['specialist context performs no governance mutations', !/\.insert\(/.test(context) && !/\.update\(/.test(context) && !/\.delete\(/.test(context) && !/\.rpc\(/.test(context)],
  ['brief itself preserves no-AI-policy-facts truth contract', /policyFactsGeneratedByAI:\s*false/.test(brief) && /complianceClaimsGeneratedByAI:\s*false/.test(brief)],
]

const failures = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Specialist Governance Intelligence verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`Specialist Governance Intelligence verification passed (${checks.length} checks).`)
