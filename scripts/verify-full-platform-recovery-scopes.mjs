import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const requiredFiles = [
  'infra/recovery/full-platform-recovery-contract.json',
  'infra/recovery/platform-manifest.json',
  'infra/recovery/recovery-scope-map.json',
  'infra/recovery/secret-inventory.example.json',
  'supabase/config.toml',
  'vercel.json',
]

for (const path of requiredFiles) {
  await access(path, constants.R_OK)
  console.log(`PASS recovery-scope artifact ${path}`)
}

const contract = JSON.parse(await readFile('infra/recovery/full-platform-recovery-contract.json', 'utf8'))
const scopeMap = JSON.parse(await readFile('infra/recovery/recovery-scope-map.json', 'utf8'))
const platform = JSON.parse(await readFile('infra/recovery/platform-manifest.json', 'utf8'))
const secretInventory = JSON.parse(await readFile('infra/recovery/secret-inventory.example.json', 'utf8'))
const supabaseConfig = await readFile('supabase/config.toml', 'utf8')
const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8'))

const requiredScopes = ['STORAGE','IDENTITY_CONFIG','APPLICATION_CONFIG','EDGE_RUNTIME','DEPENDENCIES','SERVICE_VALIDATION']
for (const scope of requiredScopes) {
  if (!scopeMap.scopes?.[scope]) throw new Error(`Recovery scope map is missing ${scope}`)
  if (!contract.requiredScopes?.[scope]) throw new Error(`Full-platform recovery contract is missing ${scope}`)
  const evidence = contract.requiredScopes[scope].restoreEvidenceRequired
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error(`${scope} must define restore evidence`)
  console.log(`PASS full-platform recovery scope ${scope}`)
}

if (contract.evidenceRules?.failClosed !== true) throw new Error('Recovery scope evidence must fail closed.')
if (contract.evidenceRules?.secretValuesAllowed !== false) throw new Error('Recovery evidence must prohibit secret values.')
if (contract.evidenceRules?.staticReconstructionEvidenceMayClaimRestored !== false) throw new Error('Static reconstruction evidence must not claim RESTORED.')
if (contract.evidenceRules?.staticReconstructionEvidenceMayClaimReady !== false) throw new Error('Static reconstruction evidence must not claim READY.')
if (contract.timingTruth?.targetRpoMinutes !== 60 || contract.timingTruth?.targetRtoMinutes !== 240) throw new Error('Recovery objectives must remain 60-minute RPO and 240-minute RTO.')
if (contract.timingTruth?.authoritativeRecoveryPointRequiredForRpo !== true) throw new Error('Authoritative recovery point is required to prove RPO.')
if (contract.timingTruth?.serviceReadyTimestampRequiredForRto !== true) throw new Error('Service-ready timestamp is required to prove RTO.')
if (contract.timingTruth?.databaseRestoreDurationIsPlatformRto !== false) throw new Error('Database restore duration must not be treated as platform RTO.')

const edgeFunctions = platform.supabase?.requiredEdgeFunctions ?? []
if (edgeFunctions.length < 6) throw new Error('Platform manifest must retain all required Edge Functions.')
for (const functionName of edgeFunctions) {
  await access(`supabase/functions/${functionName}/index.ts`, constants.R_OK)
  const section = `[functions.${functionName}]`
  const start = supabaseConfig.indexOf(section)
  if (start < 0) throw new Error(`Missing source-controlled Supabase config for ${functionName}`)
  const next = supabaseConfig.indexOf('\n[functions.', start + section.length)
  const body = supabaseConfig.slice(start, next < 0 ? supabaseConfig.length : next)
  if (!/verify_jwt\s*=\s*true/.test(body)) throw new Error(`${functionName} must keep JWT verification enabled`)
}
console.log('PASS EDGE_RUNTIME source authority')

if (!platform.vercel?.projectId || !Array.isArray(platform.vercel.requiredDomains) || platform.vercel.requiredDomains.length < 1) {
  throw new Error('APPLICATION_CONFIG requires Vercel topology.')
}
if (!Array.isArray(platform.render?.requiredServices) || platform.render.requiredServices.length < 3) {
  throw new Error('APPLICATION_CONFIG/DEPENDENCIES requires Render topology.')
}
if (!Array.isArray(vercelConfig.crons) || !vercelConfig.crons.some((item) => item.path === '/api/jobs/worker')) {
  throw new Error('Vercel worker cron must be source controlled.')
}
console.log('PASS APPLICATION_CONFIG topology source authority')

if (secretInventory.rules?.secretValuesAllowed !== false || secretInventory.rules?.verifyPresenceDuringRecovery !== true) {
  throw new Error('Identity/application recovery secret inventory must contain names only and require recovery-time presence checks.')
}
console.log('PASS IDENTITY_CONFIG secret-name recovery boundary')

const storage = contract.requiredScopes.STORAGE
if (storage.zeroObjectsMaySatisfyObjectByteRestoreOnlyWhenAuthoritativeInventoryShowsZero !== true) {
  throw new Error('Zero-object Storage optimization must require authoritative zero-object evidence.')
}
console.log('PASS STORAGE object-byte truth boundary')

const dependencies = new Set(scopeMap.scopes.DEPENDENCIES)
for (const name of ['opa','otel','jdbc-bridge','ai-model-providers','retrieval-search','email-identity']) {
  if (!dependencies.has(name)) throw new Error(`DEPENDENCIES recovery map is missing ${name}`)
}
console.log('PASS DEPENDENCIES recovery inventory')

const serviceChecks = new Set(scopeMap.scopes.SERVICE_VALIDATION)
for (const name of ['health','auth','catalog','profiling','queue-worker','governance','ai-routing']) {
  if (!serviceChecks.has(name)) throw new Error(`SERVICE_VALIDATION recovery map is missing ${name}`)
}
console.log('PASS SERVICE_VALIDATION required journey inventory')

console.log('Full-platform recovery-scope reconstruction contract verification completed.')
