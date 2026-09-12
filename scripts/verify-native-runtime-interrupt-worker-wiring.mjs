import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const worker = readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))

assert.ok(worker.includes("import { processDueNativeRuntimeInterrupts } from '@/lib/agents/runtime/native-runtime-interrupt-lifecycle'"))
assert.ok(worker.includes('processDueNativeRuntimeInterrupts(50)'))
assert.ok(worker.includes('nativeRuntimeInterrupts'))
assert.ok(worker.includes('isAuthorizedWorkerRequest'))
assert.ok(Array.isArray(vercel.crons))
assert.ok(vercel.crons.some((cron) => cron.path === '/api/jobs/worker' && cron.schedule === '* * * * *'))

console.log('native runtime interrupt worker wiring verification passed')
