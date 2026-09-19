export type DataNexusEnvironment = 'production' | 'canary' | 'development'
export type DataNexusPlatform = 'vercel' | 'cloudflare' | 'local'

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

export function dataNexusEnvironment(env: NodeJS.ProcessEnv = process.env): DataNexusEnvironment {
  const configured = normalized(env.DATANEXUS_ENV)
  if (configured) {
    if (configured === 'production' || configured === 'canary' || configured === 'development') return configured
    throw new Error(`Unsupported DATANEXUS_ENV: ${configured}`)
  }

  // Backward-compatible safety bridge while production Vercel configuration is migrated.
  // New non-Vercel runtimes must set DATANEXUS_ENV explicitly.
  if (normalized(env.VERCEL_ENV) === 'production') return 'production'
  return 'development'
}

export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return dataNexusEnvironment(env) === 'production'
}

export function dataNexusPlatform(env: NodeJS.ProcessEnv = process.env): DataNexusPlatform {
  const configured = normalized(env.DATANEXUS_PLATFORM)
  if (configured) {
    if (configured === 'vercel' || configured === 'cloudflare' || configured === 'local') return configured
    throw new Error(`Unsupported DATANEXUS_PLATFORM: ${configured}`)
  }
  return env.VERCEL ? 'vercel' : 'local'
}

export function deploymentCommitSha(env: NodeJS.ProcessEnv = process.env) {
  const candidate = (env.DATANEXUS_COMMIT_SHA ?? env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA ?? '').trim()
  return /^[0-9a-f]{40}$/i.test(candidate) ? candidate.toLowerCase() : null
}

export function deploymentReleaseId(env: NodeJS.ProcessEnv = process.env) {
  const value = (env.DATANEXUS_RELEASE_ID ?? env.CLOUDFLARE_DEPLOYMENT_ID ?? env.VERCEL_DEPLOYMENT_ID ?? '').trim()
  return value || null
}

export function deploymentBuildTimestamp(env: NodeJS.ProcessEnv = process.env) {
  const value = (env.DATANEXUS_BUILD_TIMESTAMP ?? '').trim()
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
