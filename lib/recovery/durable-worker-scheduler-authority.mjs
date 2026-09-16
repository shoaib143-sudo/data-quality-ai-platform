const REQUIRED_JOB_NAME = 'dgp-durable-worker-kick'
const REQUIRED_SCHEDULE = '* * * * *'
const REQUIRED_COMMAND = 'select orchestration.kick_durable_worker();'
const REQUIRED_SECRET = 'DGP_DURABLE_WORKER_SECRET'
const REQUIRED_WORKER_URL = 'https://data-quality-ai-platform.vercel.app/api/jobs/worker'

function requireMatch(text, pattern, code) {
  if (!pattern.test(text)) throw new Error(code)
}

export function verifyDurableWorkerSchedulerAuthority({ migrationSql, vercelConfig }) {
  if (typeof migrationSql !== 'string' || !migrationSql.trim()) {
    throw new Error('DURABLE_WORKER_SCHEDULER_MIGRATION_MISSING')
  }
  if (!vercelConfig || typeof vercelConfig !== 'object') {
    throw new Error('VERCEL_CONFIG_MISSING')
  }

  requireMatch(migrationSql, /create\s+or\s+replace\s+function\s+orchestration\.kick_durable_worker\s*\(\s*\)/i, 'DURABLE_WORKER_KICK_FUNCTION_MISSING')
  requireMatch(migrationSql, /security\s+definer/i, 'DURABLE_WORKER_KICK_NOT_SECURITY_DEFINER')
  requireMatch(migrationSql, /set\s+search_path\s*=\s*pg_catalog\s*,\s*vault\s*,\s*net/i, 'DURABLE_WORKER_KICK_SEARCH_PATH_NOT_PINNED')
  requireMatch(migrationSql, /vault\.decrypted_secrets/i, 'DURABLE_WORKER_VAULT_AUTHORITY_MISSING')
  requireMatch(migrationSql, new RegExp(REQUIRED_SECRET), 'DURABLE_WORKER_SECRET_NAME_MISSING')
  requireMatch(migrationSql, /net\.http_post/i, 'DURABLE_WORKER_HTTP_DISPATCH_MISSING')
  requireMatch(migrationSql, /'Authorization'\s*,\s*'Bearer '\s*\|\|\s*worker_secret/i, 'DURABLE_WORKER_BEARER_AUTH_MISSING')
  requireMatch(migrationSql, new RegExp(REQUIRED_WORKER_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'DURABLE_WORKER_CANONICAL_URL_MISSING')
  requireMatch(migrationSql, /'mode'\s*,\s*'ADAPTIVE_DISPATCH'/i, 'DURABLE_WORKER_ADAPTIVE_DISPATCH_MISSING')
  requireMatch(migrationSql, /'source'\s*,\s*'JOB_QUEUE_TRIGGER'/i, 'DURABLE_WORKER_SOURCE_MARKER_MISSING')
  requireMatch(migrationSql, /revoke\s+all\s+on\s+function\s+orchestration\.kick_durable_worker\s*\(\s*\)\s+from\s+public/i, 'DURABLE_WORKER_PUBLIC_EXECUTE_NOT_REVOKED')
  requireMatch(migrationSql, /grant\s+execute\s+on\s+function\s+orchestration\.kick_durable_worker\s*\(\s*\)\s+to\s+service_role/i, 'DURABLE_WORKER_SERVICE_ROLE_EXECUTE_MISSING')

  const schedulePattern = /cron\.schedule\s*\(\s*'dgp-durable-worker-kick'\s*,\s*'\* \* \* \* \*'\s*,\s*'select orchestration\.kick_durable_worker\(\);'\s*\)/i
  requireMatch(migrationSql, schedulePattern, 'DURABLE_WORKER_ONE_MINUTE_CRON_MISSING')

  const duplicateVercelCron = Array.isArray(vercelConfig.crons)
    ? vercelConfig.crons.find((cron) => cron?.path === '/api/jobs/worker')
    : undefined
  if (duplicateVercelCron) {
    throw new Error('DURABLE_WORKER_DUPLICATE_VERCEL_CRON_PRESENT')
  }

  return {
    authority: 'SUPABASE_PG_CRON',
    jobName: REQUIRED_JOB_NAME,
    schedule: REQUIRED_SCHEDULE,
    command: REQUIRED_COMMAND,
    workerUrl: REQUIRED_WORKER_URL,
    secretName: REQUIRED_SECRET,
  }
}
