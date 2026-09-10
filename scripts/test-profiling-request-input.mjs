import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const helperSource = await readFile(new URL('../lib/profiling/request-input.ts', import.meta.url), 'utf8')
const transpiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

const helperModule = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`)
const { sanitizeProfilingRequestInput } = helperModule

const maliciousRows = [
  { id: 1, email: 'fabricated@example.test', completeness: 1 },
  { id: 2, email: 'fabricated2@example.test', completeness: 1 },
]

const sanitized = sanitizeProfilingRequestInput({
  projectId: 'attacker-project',
  datasetVersionId: 'attacker-version',
  agentDefinitionId: 'attacker-agent',
  rows: maliciousRows,
  metrics: [{ metric_key: 'null_rate', numeric_value: 0 }],
  findings: [{ severity: 'INFO', title: 'fabricated' }],
  score: { overall_score: 1 },
  source: { jdbcUrl: 'jdbc:postgresql://attacker.invalid/db' },
  secret: 'must-not-survive',
  trigger: ' PROFILING_REMEDIATION_VERIFICATION ',
  workflow_instance_id: ' workflow-123 ',
  correlation_id: ' correlation-456 ',
})

assert.deepEqual(sanitized, {
  trigger: 'PROFILING_REMEDIATION_VERIFICATION',
  workflowInstanceId: 'workflow-123',
  correlationId: 'correlation-456',
})
assert.equal('rows' in sanitized, false)
assert.equal('metrics' in sanitized, false)
assert.equal('findings' in sanitized, false)
assert.equal('score' in sanitized, false)
assert.equal('source' in sanitized, false)
assert.equal('secret' in sanitized, false)
assert.equal('projectId' in sanitized, false)

const routeSource = await readFile(new URL('../app/api/agents/run/route.ts', import.meta.url), 'utf8')
assert.match(routeSource, /sanitizeProfilingRequestInput\(rawInput\)/)
assert.match(routeSource, /input:\s*persistedRequestInput/)
assert.match(routeSource, /requestInput,\s*\n\s*},\s*\n\s*maxAttempts/)
assert.doesNotMatch(routeSource, /input:\s*\{\s*\.\.\.rawInput/)

const executorSource = await readFile(new URL('../lib/agents/executors/profiling-executor.ts', import.meta.url), 'utf8')
assert.match(executorSource, /executeProfilingMetrics\(datasetVersionId, profilingRunId, \{\}\)/)
assert.doesNotMatch(executorSource, /executeProfilingMetrics\(datasetVersionId, profilingRunId, input\)/)

console.log('Profiling request input trust-boundary checks passed.')
