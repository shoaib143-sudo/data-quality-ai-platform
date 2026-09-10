import fs from 'node:fs'

const metricPath = 'lib/profiling/metric-engine.ts'
const agentPath = 'lib/agents/executors/profiling-executor.ts'

const metric = fs.readFileSync(metricPath, 'utf8')
const oldSignature = "export async function executeProfilingMetrics(datasetVersionId: string, profilingRunId: string, input: Record<string, unknown> = {}) {"
const newSignature = "export async function executeProfilingMetrics(datasetVersionId: string, profilingRunId: string) {"
const oldEvidencePath = `  const inputRows = Array.isArray(input.rows) ? input.rows.filter((row): row is Row => !!row && typeof row === 'object' && !Array.isArray(row)) : null\n  const loaded = inputRows ? { rowCount: inputRows.length, rows: inputRows } : await loadProfilingRows(supabase, datasetVersionId, 1000)\n`
const newEvidencePath = `  // Metric evidence is always loaded from the registered execution source.\n  // Callers cannot supply rows, findings, metric values, or scores.\n  const loaded = await loadProfilingRows(supabase, datasetVersionId, 1000)\n`

if (!metric.includes(oldSignature)) throw new Error('Expected executeProfilingMetrics signature was not found.')
if (!metric.includes(oldEvidencePath)) throw new Error('Expected caller-supplied metric evidence path was not found.')

const updatedMetric = metric.replace(oldSignature, newSignature).replace(oldEvidencePath, newEvidencePath)
if (updatedMetric.includes('input.rows') || updatedMetric.includes('const inputRows')) {
  throw new Error('Caller-supplied profiling rows remain in the metric engine after patching.')
}
fs.writeFileSync(metricPath, updatedMetric)

const agent = fs.readFileSync(agentPath, 'utf8')
const oldCall = 'executeProfilingMetrics(datasetVersionId, profilingRunId, {})'
if (!agent.includes(oldCall)) throw new Error('Expected governed metric engine call was not found.')
fs.writeFileSync(agentPath, agent.replace(oldCall, 'executeProfilingMetrics(datasetVersionId, profilingRunId)'))

console.log('P1 metric evidence trust boundary patched.')
