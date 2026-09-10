import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const connectorPath = resolve(repositoryRoot, 'lib/connectors/jdbc.ts')
const source = readFileSync(connectorPath, 'utf8')

const checks = [
  {
    ok: /const\s+DEFAULT_TIMEOUT_MS\s*=\s*120_000\b/.test(source),
    message: 'default JDBC connector timeout must remain aligned to the 120-second bridge query contract',
  },
  {
    ok: /process\.env\.JDBC_CONNECTOR_TIMEOUT_MS/.test(source),
    message: 'JDBC_CONNECTOR_TIMEOUT_MS override must remain supported',
  },
  {
    ok: /configured\s*>=\s*1_000/.test(source),
    message: 'configured JDBC timeout must retain the 1-second minimum validation floor',
  },
  {
    ok: /Math\.min\(configured,\s*180_000\)/.test(source),
    message: 'configured JDBC timeout must remain capped at 180 seconds',
  },
  {
    ok: /setTimeout\(\(\)\s*=>\s*controller\.abort\(\),\s*connectorTimeoutMs\(\)\)/.test(source),
    message: 'bridge requests must continue to enforce the governed connector timeout through AbortController',
  },
]

const failures = checks.filter((check) => !check.ok)
if (failures.length > 0) {
  console.error('JDBC connector timeout contract failed:')
  for (const failure of failures) console.error(`- ${failure.message}`)
  process.exit(1)
}

console.log('JDBC connector timeout contract passed: default=120s, configurable floor preserved, maximum=180s, AbortController enforcement intact.')
