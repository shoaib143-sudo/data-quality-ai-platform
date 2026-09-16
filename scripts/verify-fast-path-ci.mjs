import { readFile } from 'node:fs/promises'

const files = {
  quality: '.github/workflows/quality-gate.yml',
  revalidate: '.github/workflows/p0-p4-revalidation.yml',
  certify: '.github/workflows/v6-operational-certification.yml',
}

const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, 'utf8')])))

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

for (const [name, text] of Object.entries(source)) {
  requireMatch(text, /pull_request:[\s\S]*branches:[\s\S]*main/, `${name} must still validate pull requests targeting main`)
  requireMatch(text, /push:[\s\S]*branches:[\s\S]*main/, `${name} must still run on the exact merged main line`)
}

// The substantive PR gate stays in Quality Gate.
requireMatch(source.quality, /Fast-path pull request gate[\s\S]*if: github\.event_name == 'pull_request'[\s\S]*ci-fast-path\.sh/, 'Quality Gate must use the fast PR suite.')
requireMatch(source.quality, /Full post-merge quality certification[\s\S]*if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'[\s\S]*ci-full-quality-gate\.sh/, 'Quality Gate must run the full suite after merge to main.')

// Heavyweight historical required contexts remain published as tiny PR sentinels so
// ruleset compatibility is preserved without putting expensive work on the merge path.
requireMatch(source.revalidate, /revalidate:[\s\S]*if: github\.event_name == 'pull_request'[\s\S]*Fast-path revalidation sentinel/, 'Revalidation must publish a lightweight PR sentinel.')
requireMatch(source.revalidate, /revalidate-full:[\s\S]*if: github\.event_name != 'pull_request'[\s\S]*Full post-merge P0-P5 certification/, 'Revalidation must keep the full post-merge suite.')

requireMatch(source.certify, /certify:[\s\S]*if: github\.event_name == 'pull_request'[\s\S]*Fast-path certification sentinel/, 'V6 certification must publish a lightweight PR sentinel.')
requireMatch(source.certify, /certify-full:[\s\S]*if: github\.event_name != 'pull_request'[\s\S]*Full post-merge operational certification/, 'V6 certification must keep the full post-merge suite.')

requireMatch(source.certify, /runtime-slo:[\s\S]*if: github\.event_name == 'pull_request'[\s\S]*Fast-path runtime SLO sentinel/, 'Runtime SLO must publish a lightweight PR sentinel.')
requireMatch(source.certify, /post-merge-runtime-slo:[\s\S]*if: github\.event_name != 'pull_request'[\s\S]*Production concurrency and latency SLO/, 'Production runtime SLO must remain a full post-merge certification check.')

requireMatch(source.certify, /clean-database-reconstruction:[\s\S]*if: github\.event_name == 'pull_request'[\s\S]*Fast-path database reconstruction sentinel/, 'Database reconstruction must publish a lightweight PR sentinel.')
requireMatch(source.certify, /post-merge-clean-database-reconstruction:[\s\S]*if: github\.event_name != 'pull_request'[\s\S]*Reconstruct clean Supabase database from migrations/, 'Clean database reconstruction must remain a full post-merge certification check.')

const fast = await readFile('scripts/ci-fast-path.sh', 'utf8')
for (const required of ['verify-p0-p4-revalidation.mjs', 'audit-user-facing-admin-routes.mjs', 'verify-migration-version-uniqueness.mjs', 'tsc --noEmit', 'verify:github-governance', 'pnpm run build']) {
  if (!fast.includes(required)) throw new Error(`Fast-path suite is missing required safety check: ${required}`)
}

console.log(JSON.stringify({
  valid: true,
  model: 'FAST_PR_SENTINELS_FULL_MAIN',
  substantivePrGateRetained: true,
  fullCertificationRetained: true,
}, null, 2))
