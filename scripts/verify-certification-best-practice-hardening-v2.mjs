import fs from 'node:fs'

const profilePath = process.env.DATANEXUS_CERTIFICATION_HARDENING_PROFILE || 'infra/platform-assurance/certification-best-practice-hardening-v2.json'
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
const fail = (message) => { throw new Error(message) }

if (profile.schemaVersion !== 1) fail('Certification hardening profile schemaVersion must be 1.')
if (profile.authorityContract !== 'infra/platform-assurance/post-implementation-certification-contract.json') {
  fail('Certification hardening profile must bind the authoritative post-implementation contract.')
}
if (!fs.existsSync(profile.authorityContract)) fail('Authoritative post-implementation certification contract is missing.')
if (profile.claim !== 'MANDATORY_INTERNAL_CONTROL_PROFILE_NOT_EXTERNAL_CERTIFICATION') {
  fail('Certification hardening profile must not be represented as external certification.')
}

const truthRules = {
  previewEvidenceMayProveProduction: false,
  unverifiableBuildProvenanceMayProveProduction: false,
  missingReleaseDependencyInventoryMaySatisfyReleaseEvidence: false,
  selfAuthoredProvenanceMayProveProduction: false,
}
for (const [key, expected] of Object.entries(truthRules)) {
  if (profile.truthRules?.[key] !== expected) fail(`Certification hardening truth rule ${key} must remain ${expected}.`)
}

const supplyChainRequirements = [
  'release candidate has a machine-readable SBOM or equivalent complete dependency inventory',
  'release dependency inventory is refreshed on the exact final source revision',
  'build provenance binds source revision, builder identity and artifact digest',
  'provenance authenticity is independently verifiable',
  'production deployment identity is cryptographically or immutably bound to the certified artifact',
  'known-vulnerability policy is evaluated against the release candidate dependency inventory',
]
for (const requirement of supplyChainRequirements) {
  if (!profile.supplyChainRequirements?.includes(requirement)) fail(`Missing supply-chain certification requirement: ${requirement}`)
}

const postImplementationRequirements = [
  'all certification evidence is regenerated after the final implementation change',
  'preview validation is useful evidence but cannot substitute for production-bound runtime evidence',
  'independent assurance producer is separated from the implementation producer',
  'security and dependency findings are re-evaluated on the exact final revision',
  'residual release-blocking risks remain explicit and fail closed',
  'production verification binds source, build, deployment, database and live runtime evidence',
]
for (const requirement of postImplementationRequirements) {
  if (!profile.postImplementationRequirements?.includes(requirement)) fail(`Missing post-implementation hardening requirement: ${requirement}`)
}

for (const reference of [
  'NIST_SP_800_218_SSDF_1_1_PS_3_2_PROVENANCE',
  'NIST_SP_800_218_SSDF_1_1_RV_VULNERABILITY_RESPONSE',
  'SLSA_1_2_BUILD_PROVENANCE_AUTHENTICITY',
  'OWASP_ASVS_5_0_RELEASE_VERIFICATION',
  'OWASP_GENAI_2026_AGENTIC_RISK_REVIEW',
]) {
  if (!profile.bestPracticeAlignment?.includes(reference)) fail(`Missing certification hardening reference ${reference}.`)
}

console.log(`Certification best-practice hardening verified: ${supplyChainRequirements.length} supply-chain controls and ${postImplementationRequirements.length} post-implementation controls.`)
