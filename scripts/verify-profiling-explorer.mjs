import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

const [page, explorer] = await Promise.all([
  source('app/profiling/explorer/page.tsx'),
  source('app/profiling/profiling-explorer.tsx'),
])

requireMatch(page, /from\('profile_columns'\)[\s\S]*total_count[\s\S]*null_count[\s\S]*blank_count[\s\S]*zero_count[\s\S]*distinct_count[\s\S]*distinct_percentage/, 'Profiling explorer page must load persisted column statistics.')
requireMatch(page, /from\('profile_distributions'\)[\s\S]*distribution_type[\s\S]*distribution/, 'Profiling explorer page must load persisted distributions.')
requireMatch(page, /distributions=\{\(distributions\s*\?\?\s*\[\]\)\s+as\s+any\}/, 'Profiling explorer page must pass distributions to the client explorer.')

requireMatch(explorer, /type\s+ExplorerDistribution/, 'Profiling explorer must define the persisted distribution contract.')
requireMatch(explorer, /Histogram/, 'Profiling explorer must render a histogram drill-down.')
requireMatch(explorer, /Quantiles/, 'Profiling explorer must render a quantile drill-down.')
requireMatch(explorer, /p01[\s\S]*p05[\s\S]*p25[\s\S]*p50[\s\S]*p75[\s\S]*p95[\s\S]*p99/, 'Profiling explorer must preserve standard persisted quantiles.')
requireMatch(explorer, /Null rate[\s\S]*Blank rate[\s\S]*Zero rate[\s\S]*Distinct %/, 'Profiling explorer must expose core persisted column statistics.')
requireMatch(explorer, /selectedDistributions\.get\('HISTOGRAM'\)/, 'Histogram must be sourced from persisted distribution data.')
requireMatch(explorer, /selectedDistributions\.get\('QUANTILES'\)/, 'Quantiles must be sourced from persisted distribution data.')

console.log(JSON.stringify({ valid: true, contracts: { columnStatistics: true, histogram: true, quantiles: true, persistedEvidenceOnly: true } }, null, 2))
