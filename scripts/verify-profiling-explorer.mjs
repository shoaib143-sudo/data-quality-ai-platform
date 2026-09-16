import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

const [page, explorer, dashboard] = await Promise.all([
  source('app/profiling/explorer/page.tsx'),
  source('app/profiling/profiling-explorer.tsx'),
  source('app/profiling/profiling-dashboard.tsx'),
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

requireMatch(dashboard, /Data Profiling[\s\S]*Data Observability[\s\S]*Data Quality/, 'Consolidated profiling dashboard must preserve the three frozen top-level workspaces.')
requireMatch(dashboard, /Profiling Summary[\s\S]*Column Statistics[\s\S]*Duplicate Analysis[\s\S]*Schema Overview[\s\S]*Sensitive Data Detection[\s\S]*Outlier Detection[\s\S]*Sample Data Preview/, 'Consolidated profiling dashboard must preserve the frozen profiling sections.')
requireMatch(dashboard, /setDrilldown\(\{ kind: 'column'/, 'Column statistics and schema rows must support interactive drill-down.')
requireMatch(dashboard, /setDrilldown\(\{ kind: 'duplicates' \}\)/, 'Duplicate analysis must support interactive drill-down.')
requireMatch(dashboard, /setDrilldown\(\{ kind: 'sensitive' \}\)/, 'Sensitive-data analysis must support interactive drill-down.')
requireMatch(dashboard, /setDrilldown\(\{ kind: 'outliers' \}\)/, 'Outlier analysis must support interactive drill-down.')
requireMatch(dashboard, /setDrilldown\(\{ kind: 'sample' \}\)/, 'Sample data preview must support interactive drill-down.')
requireMatch(dashboard, /profile_distributions|distributionsByColumn/, 'Dashboard histograms must be backed by persisted profiling distributions.')
requireMatch(dashboard, /profiling\/explorer\?runId=.*columnId=/, 'Column drill-down must link to the full persisted profiling explorer.')

console.log(JSON.stringify({
  valid: true,
  contracts: {
    columnStatistics: true,
    histogram: true,
    quantiles: true,
    persistedEvidenceOnly: true,
    consolidatedLayout: true,
    interactiveDrilldown: true,
    samplePreview: true,
  },
}, null, 2))
