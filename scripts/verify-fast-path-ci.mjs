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

requireMatch(source.quality, /Fast-path pull request gate[\s\S]*if: github\.event_name == 'pull_request'[\s\S]*ci-fast-path\.sh/, 'Quality Gate must use the fast PR suite.')
requireMatch(source.quality, /Full post-merge quality certification[\s\S]*if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'[\s\S]*ci-full-quality-gate\.sh/, 'Quality Gate must run the full suite after merge to main.')
requireMatch(source.revalidate, /PR fast-path security and evidence revalidation[\s\S]*if: github\.event_name == 'pull_request'/, 'Revalidation must have a meaningful PR fast path.')
requireMatch(source.revalidate, /Full post-merge P0-P5 certification[\s\S]*if: github\.event_name != 'pull_request'/, 'Revalidation must keep the full post-merge suite.')
requireMatch(source.certify, /PR fast-path certification preflight[\s\S]*if: github\.event_name == 'pull_request'/, 'V6 certification must have a PR preflight.')
requireMatch(source.certify, /Full post-merge operational certification[\s\S]*if: github\.event_name != 'pull_request'/, 'V6 certification must keep the full post-merge suite.')
requireMatch(source.certify, /Production concurrency and latency SLO[\s\S]*if: github\.event_name != 'pull_request'/, 'Production runtime SLO must remain a full certification check.')
requireMatch(source.certify, /Reconstruct clean Supabase database from migrations[\s\S]*if: github\.event_name != 'pull_request'/, 'Clean database reconstruction must remain a full certification check.')

const fast = await readFile('scripts/ci-fast-path.sh', 'utf8')
for (const required of ['verify-p0-p4-revalidation.mjs', 'audit-user-facing-admin-routes.mjs', 'verify-migration-version-uniqueness.mjs', 'tsc --noEmit', 'verify:github-governance', 'pnpm run build']) {
  if (!fast.includes(required)) throw new Error(`Fast-path suite is missing required safety check: ${required}`)
}

console.log(JSON.stringify({ valid: true, model: 'FAST_PR_FULL_MAIN', fullCertificationRetained: true }, null, 2))
