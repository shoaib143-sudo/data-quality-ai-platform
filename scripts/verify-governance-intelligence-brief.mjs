import fs from 'node:fs'

const brief = fs.readFileSync('lib/governance/governance-intelligence-brief.ts', 'utf8')
const route = fs.readFileSync('app/api/governance/intelligence/route.ts', 'utf8')

const checks = [
  ['brief reads formal database verifier', /rpc\('verify_ai_governance_intelligence'/.test(brief)],
  ['brief reads governed intelligence model', /loadProjectAIGovernanceIntelligence/.test(brief)],
  ['brief labels active authority explicitly', /AUTHORITATIVE_ACTIVE/.test(brief) && /ACTIVE_AND_APPROVED_ONLY/.test(brief)],
  ['brief labels proposals non-authoritative', /PROPOSED_NON_AUTHORITATIVE/.test(brief)],
  ['brief requires active and approved controls for authority', /lifecycle_status.*ACTIVE/.test(brief) && /review_status.*APPROVED/.test(brief)],
  ['brief copies formal blockers from verifier', /formalBlockers:\s*blockers/.test(brief) && /array\(gate\.blockers\)/.test(brief)],
  ['brief maps enterprise corpus blocker to human authority boundary', /REAL_GOVERNANCE_CORPUS_NOT_INGESTED/.test(brief) && /HUMAN_AUTHORITY_REQUIRED/.test(brief)],
  ['brief maps field lineage blocker to external source artifact', /REAL_FIELD_LINEAGE_DATA_NOT_INGESTED/.test(brief) && /EXTERNAL_SOURCE_ARTIFACT_REQUIRED/.test(brief)],
  ['brief does not claim AI authors policy facts', /policyFactsGeneratedByAI:\s*false/.test(brief) && /complianceClaimsGeneratedByAI:\s*false/.test(brief)],
  ['brief preserves pending control review boundary', /CONTROL_AUTHORITY_PENDING/.test(brief) && /HUMAN_APPROVAL_REQUIRED/.test(brief)],
  ['brief exposes continuous reconciliation state', /continuousReconciliationPresent/.test(brief) && /reconciliationSloMinutes/.test(brief) && /staleEvaluationGaps/.test(brief)],
  ['brief exposes findings and latest evaluations', /openFindings/.test(brief) && /latestEvaluations/.test(brief)],
  ['brief states no fabrication of missing artifacts', /does not fabricate missing enterprise policy approval, provenance, attestation, transformation lineage, evidence, or ownership/.test(brief)],
  ['brief recommendations are deterministic', /Recommendations are deterministic mappings/.test(brief)],
  ['brief does not query raw control evidence', !/from\('control_evidence'\)/.test(brief)],
  ['API requires authenticated user', /requireUser\(\)/.test(route)],
  ['API requires catalog read', /authorizeProject\(user\.id, projectId, 'catalog\.read'\)/.test(route)],
  ['API delegates to deterministic brief builder', /buildGovernanceIntelligenceBrief\(projectId\)/.test(route)],
  ['API is read-only', !/\.insert\(/.test(route) && !/\.update\(/.test(route) && !/\.delete\(/.test(route) && !/export async function POST/.test(route)],
]

const failures = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Governance Intelligence brief verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`Governance Intelligence brief verification passed (${checks.length} checks).`)
