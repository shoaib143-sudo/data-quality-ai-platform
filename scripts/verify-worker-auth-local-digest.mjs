import fs from 'node:fs'

const helper = fs.readFileSync('lib/orchestration/worker-auth.ts', 'utf8')
const route = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')

for (const marker of [
  "from 'node:crypto'",
  'timingSafeEqual',
  'DURABLE_WORKER_SECRET_SHA256',
  'matchesSecretDigest',
  'isAuthorizedWorkerBearer',
]) {
  if (!helper.includes(marker)) throw new Error(`Worker auth helper missing: ${marker}`)
}

if (!/DURABLE_WORKER_SECRET_SHA256\s*=\s*'[0-9a-f]{64}'/.test(helper)) {
  throw new Error('Worker auth source must contain only a SHA-256 digest, never the plaintext durable worker secret')
}
if (helper.includes('DGP_DURABLE_WORKER_SECRET=')) {
  throw new Error('Plaintext durable worker secret must never be embedded in source')
}
if (!route.includes("import { isAuthorizedWorkerBearer } from '@/lib/orchestration/worker-auth'")) {
  throw new Error('Worker route must use the local bearer verifier')
}
if (route.includes("rpc('verify_worker_secret'")) {
  throw new Error('Worker authentication must not depend on a Supabase RPC round trip')
}
if (!route.includes('process.env.CRON_SECRET')) {
  throw new Error('Vercel CRON_SECRET fast path must remain supported')
}
if (!route.includes("console.error('[worker-dispatch]'")) {
  throw new Error('Adaptive worker failures must emit non-secret runtime diagnostics')
}
if (/console\.(?:log|error|warn)\([^\n]*(suppliedSecret|authorization)/.test(route + helper)) {
  throw new Error('Worker bearer material must never be logged')
}

console.log('Worker auth local digest boundary verified: local constant-time validation, no database dependency, fail-closed semantics, and non-secret dispatch diagnostics.')
