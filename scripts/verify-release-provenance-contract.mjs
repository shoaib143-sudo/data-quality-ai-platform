import fs from 'node:fs'

const contract = JSON.parse(fs.readFileSync('infra/release-provenance/contract.json', 'utf8'))
const workflow = fs.readFileSync('.github/workflows/release-provenance.yml', 'utf8')
const generator = fs.readFileSync('scripts/generate-reference-build-manifest.mjs', 'utf8')

const fail = (message) => { throw new Error(message) }

if (contract.schemaVersion !== 1) fail('Release provenance contract must remain versioned.')
if (contract.provenanceKind !== 'SIGNED_REFERENCE_BUILD') fail('Release provenance kind drifted.')
if (contract.productionArtifactEquivalenceClaimed !== false) fail('Reference build must not claim Vercel artifact equivalence.')
if (contract.productionVerificationRequiresSeparateDeploymentSourceBinding !== true) fail('Production verification must retain independent deployment/source binding.')
if (contract.referenceBuildMustBeAttested !== true) fail('Reference build must remain an attested subject.')
if (contract.referenceManifestMustBeAttested !== true) fail('Reference manifest must remain an attested subject.')
if (contract.attestationMustBeVerifiedBeforeEvidenceUpload !== true) fail('Attestation verification must precede evidence upload.')
for (const binding of ['SOURCE_COMMIT_SHA','SOURCE_TREE_SHA','LOCKFILE_SHA256','MIGRATION_SET_SHA256','REFERENCE_BUILD_SHA256','REFERENCE_MANIFEST_ATTESTATION','GITHUB_WORKFLOW_RUN','SIGSTORE_ATTESTATION']) {
  if (!contract.requiredBindings.includes(binding)) fail(`Release provenance is missing binding ${binding}.`)
}

if (!workflow.includes('actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6')) fail('GitHub attestation action must remain pinned to the reviewed commit.')
if (!workflow.includes('id-token: write')) fail('Attestation job requires narrowly scoped OIDC write permission.')
if (!workflow.includes('attestations: write')) fail('Attestation job requires attestation write permission.')
if (!workflow.includes('artifact-metadata: write')) fail('Attestation job requires artifact metadata write permission.')
if (workflow.includes('permissions: write-all')) fail('Release provenance workflow must never use write-all.')
if (workflow.includes('pull_request_target:')) fail('Release provenance workflow must never use pull_request_target.')
if (!workflow.includes("if: github.event_name == 'push' && github.ref == 'refs/heads/main'")) fail('Signed provenance must be limited to protected-main pushes.')
if (!workflow.includes('release-evidence/reference-build.tgz')) fail('Attestation must bind the reference build bundle.')
if (!workflow.includes('release-evidence/reference-build-manifest.json')) fail('Attestation must bind the provenance manifest.')
if (!workflow.includes('gh attestation verify release-evidence/reference-build.tgz')) fail('Reference build attestation must be verified.')
if (!workflow.includes('gh attestation verify release-evidence/reference-build-manifest.json')) fail('Reference manifest attestation must be verified.')

const verifyIndex = workflow.indexOf('gh attestation verify release-evidence/reference-build.tgz')
const uploadIndex = workflow.indexOf('name: Upload release evidence bundle')
if (verifyIndex < 0 || uploadIndex < 0 || verifyIndex > uploadIndex) fail('Attestation verification must run before evidence upload.')

for (const marker of ['sourceCommitSha','sourceTreeSha','lockfileSha256','migrationSetSha256','referenceBuild','productionArtifactEquivalenceClaimed: false']) {
  if (!generator.includes(marker)) fail(`Reference build manifest generator missing ${marker}.`)
}

console.log('Signed reference build + manifest provenance contract verified.')
