import { createHash, timingSafeEqual } from 'node:crypto'

// SHA-256 of the high-entropy DGP_DURABLE_WORKER_SECRET stored in Supabase Vault.
// The plaintext bearer credential never lives in source. Rotating the vault secret
// requires updating this digest in the same governed release.
const DURABLE_WORKER_SECRET_SHA256 = '2b711faa4eec072e84dceef8d1a19348caf69fed14ab8e64af9501316a33660c'

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function matchesSecretDigest(secret: string, expectedSha256Hex: string) {
  if (!secret || !/^[0-9a-f]{64}$/i.test(expectedSha256Hex)) return false
  const actual = sha256(secret)
  const expected = Buffer.from(expectedSha256Hex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function secretsEqual(left: string, right: string) {
  if (!left || !right) return false
  const leftDigest = sha256(left)
  const rightDigest = sha256(right)
  return timingSafeEqual(leftDigest, rightDigest)
}

export function isAuthorizedWorkerBearer(suppliedSecret: string, cronSecret?: string) {
  if (!suppliedSecret) return false
  if (cronSecret && secretsEqual(suppliedSecret, cronSecret)) return true
  return matchesSecretDigest(suppliedSecret, DURABLE_WORKER_SECRET_SHA256)
}
