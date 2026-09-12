export type ExactMainCertificationContractResult = {
  valid: boolean
  failures: string[]
}

const REQUIRED_REVALIDATE_MARKERS = [
  'node scripts/verify-p0-p4-revalidation.mjs',
  'pnpm run verify:recovery-assurance',
  'pnpm run verify:worker-runtime',
  'pnpm exec tsc --noEmit',
  'pnpm run verify:profiling-lifecycle',
  'pnpm run verify:governance-reviews',
  'pnpm run verify:governance',
  'pnpm run verify:model-gateway',
  'pnpm run verify:reasoning-provider',
  'pnpm run verify:retrieval-provider',
  'pnpm run verify:governed-autonomy',
  'pnpm run verify:provider-fallback',
  'pnpm run build',
]

const REQUIRED_CERTIFY_MARKERS = [
  'node scripts/verify-v0-trusted-governance-baseline.mjs',
  'node scripts/verify-journey-sensitive-governance.mjs',
  'node scripts/verify-journey-dq-incident.mjs',
  'node scripts/verify-journey-change-governance.mjs',
  'node scripts/verify-journey-governed-investigation.mjs',
  'node scripts/verify-journey-governed-outcome-learning.mjs',
  'node scripts/audit-user-facing-admin-routes.mjs',
  'pnpm run verify:worker-runtime',
  'pnpm run verify:provider-fallback',
  'pnpm run verify:model-gateway',
  'pnpm run verify:execution-controller',
  'pnpm run verify:retrieval-provider',
  'pnpm run verify:evaluation-engine',
  'node scripts/verify-migration-version-uniqueness.mjs',
  'node scripts/verify-clean-membership-helper-acl-replay.mjs',
  'node scripts/verify-clean-synthetic-rollback-replay.mjs',
  'node scripts/verify-journey-operational-certification.mjs',
  'pnpm run build',
]

export function validateExactMainCertificationWorkflow(source: string): ExactMainCertificationContractResult {
  const failures: string[] = []

  if (!/push:\s*\n\s*branches:\s*\[main\]/m.test(source) && !/push:\s*\n\s*branches:\s*\n\s*-\s*main/m.test(source)) {
    failures.push('workflow must run automatically on pushes to protected main')
  }
  if (/pull_request\s*:/m.test(source)) {
    failures.push('exact-main workflow must not create duplicate pull-request certification contexts')
  }
  if (!/permissions:\s*\n\s*contents:\s*read/m.test(source)) {
    failures.push('workflow must retain least-privilege contents: read permissions')
  }
  if (!/\n\s{2}revalidate:\s*\n/m.test(source)) failures.push('workflow must publish exact context revalidate')
  if (!/\n\s{2}certify:\s*\n/m.test(source)) failures.push('workflow must publish exact context certify')

  for (const pin of [
    'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
    'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
    'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  ]) {
    if (!source.includes(pin)) failures.push(`workflow must preserve immutable action pin ${pin}`)
  }

  const revalidateStart = source.indexOf('\n  revalidate:')
  const certifyStart = source.indexOf('\n  certify:')
  if (revalidateStart >= 0 && certifyStart > revalidateStart) {
    const revalidate = source.slice(revalidateStart, certifyStart)
    for (const marker of REQUIRED_REVALIDATE_MARKERS) {
      if (!revalidate.includes(marker)) failures.push(`revalidate is missing ${marker}`)
    }
  }

  if (certifyStart >= 0) {
    const certify = source.slice(certifyStart)
    for (const marker of REQUIRED_CERTIFY_MARKERS) {
      if (!certify.includes(marker)) failures.push(`certify is missing ${marker}`)
    }
  }

  return { valid: failures.length === 0, failures }
}
