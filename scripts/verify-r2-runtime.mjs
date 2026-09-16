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
if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com')) {
  console.error('R2 runtime verification failed. R2_ENDPOINT must be the HTTPS account S3 endpoint.')
  process.exit(1)
}
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(process.env.R2_BUCKET)) {
  console.error('R2 runtime verification failed. R2_BUCKET does not look like a valid bucket name.')
  process.exit(1)
}
console.log(JSON.stringify({
  ok: true,
  bucket: process.env.R2_BUCKET,
  endpointHost: endpoint.hostname,
  prefix: process.env.R2_PREFIX ?? '',
  secretsPresent: true,
}))
