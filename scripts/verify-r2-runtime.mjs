const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT']
const missing = required.filter((name) => !process.env[name]?.trim())
if (missing.length) {
  console.error(`R2 runtime verification failed. Missing: ${missing.join(', ')}`)
  process.exit(1)
}
if (required.some((name) => process.env[`NEXT_PUBLIC_${name}`])) {
  console.error('R2 runtime verification failed. R2 credentials must never be exposed through NEXT_PUBLIC_* variables.')
  process.exit(1)
}
const endpoint = new URL(process.env.R2_ENDPOINT)
const expectedHost = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
if (endpoint.protocol !== 'https:' || endpoint.hostname !== expectedHost) {
  console.error('R2 runtime verification failed. R2_ENDPOINT must exactly match the configured account S3 endpoint.')
  process.exit(1)
}
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(process.env.R2_BUCKET)) {
  console.error('R2 runtime verification failed. R2_BUCKET does not look like a valid bucket name.')
  process.exit(1)
}
function deploymentEnvironment() {
  const configured = (process.env.DATANEXUS_ENV ?? '').trim().toLowerCase()
  if (configured) {
    if (!['production', 'canary', 'development'].includes(configured)) {
      console.error(`R2 runtime verification failed. Unsupported DATANEXUS_ENV: ${configured}`)
      process.exit(1)
    }
    return configured
  }
  return process.env.VERCEL_ENV?.trim().toLowerCase() === 'production' ? 'production' : 'development'
}

const provider = (process.env.STORAGE_DEFAULT_PROVIDER ?? 'supabase').trim().toLowerCase()
if (!['supabase', 'r2'].includes(provider)) {
  console.error(`R2 runtime verification failed. Unsupported STORAGE_DEFAULT_PROVIDER: ${provider}`)
  process.exit(1)
}
const environment = deploymentEnvironment()
if (provider === 'r2' && environment === 'production') {
  const approved = process.env.STORAGE_R2_PRODUCTION_CUTOVER_APPROVED?.trim().toLowerCase() === 'true'
  if (!approved) {
    console.error('R2 runtime verification failed. Production R2 cutover has not been explicitly approved.')
    process.exit(1)
  }
}
console.log(JSON.stringify({
  ok: true,
  bucket: process.env.R2_BUCKET,
  endpointHost: endpoint.hostname,
  prefix: process.env.R2_PREFIX ?? '',
  provider,
  environment,
  productionCutoverApproved: process.env.STORAGE_R2_PRODUCTION_CUTOVER_APPROVED?.trim().toLowerCase() === 'true',
  secretsPresent: true,
}))
