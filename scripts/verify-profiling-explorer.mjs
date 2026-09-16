import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

function requireNoMatch(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message)
}

const [page, profilingPage, explorer, dashboard, governedFileSource, documentEvidence, canonicalPreview] = await Promise.all([
  source('app/profiling/explorer/page.tsx'),
  source('app/profiling/page.tsx'),
  source('app/profiling/profiling-explorer.tsx'),
  source('app/profiling/profiling-dashboard.tsx'),
  source('lib/profiling/governed-file-source.ts'),
  source('lib/profiling/document-evidence.ts'),
  source('lib/profiling/canonical-document-preview.ts'),
])

requireMatch(page, /from\('profile_columns'\)[\s\S]*total_count[\s\S]*null_count[\s\S]*blank_count[\s\S]*zero_count[\s\S]*distinct_count[\s\S]*distinct_percentage/, 'Profiling explorer page must load persisted column statistics.')
requireMatch(page, /from\('profile_distributions'\)[\s\S]*distribution_type[\s\S]*distribution/, 'Profiling explorer page must load persisted distributions.')
requireMatch(page, /distributions=\{\(distributions\s*\?\?\s*\[\]\)\s+as\s+any\}/, 'Profiling explorer page must pass distributions to the client explorer.')
requireMatch(page, /sanitizePersistedMetricForPresentation[\s\S]*safeMetrics/, 'Profiling explorer must reuse the canonical persisted-metric sanitizer before rendering.')
requireMatch(page, /metrics=\{safeMetrics as any\}/, 'Profiling explorer must render sanitized persisted metrics only.')
requireNoMatch(page, /function\s+sanitizeExplorerMetric|function\s+hasUnreadableControlText/, 'Profiling explorer must not maintain a second independent unreadable-text policy.')

requireMatch(profilingPage, /canonicalizeDocumentPreview/, 'Profiling sample preview must use the canonical governed document preview boundary.')
requireMatch(profilingPage, /samples=\{canonicalPreview\.samples\}/, 'Dashboard sample preview must render canonical document evidence only.')
requireMatch(profilingPage, /canonicalPreview\.sensitiveEvidence/, 'Sensitive-data presentation must consume the same canonical readable document evidence as sample preview.')
requireMatch(profilingPage, /loadCanonicalDocumentPreviewFromSource/, 'Unreadable persisted previews must be able to reuse the governed source reader.')
requireNoMatch(profilingPage, /createAdminClient/, 'Profiling preview must not bypass authenticated RLS with an admin client.')

requireMatch(explorer, /type\s+ExplorerDistribution/, 'Profiling explorer must define the persisted distribution contract.')
requireMatch(explorer, /preferredColumnId/, 'Profiling explorer must automatically select useful persisted evidence instead of opening empty.')
requireMatch(explorer, /No deterministic findings were generated[\s\S]*Persisted column statistics and metrics are still available/, 'Explorer must distinguish no findings from no profiling evidence.')
requireMatch(explorer, /Histogram/, 'Profiling explorer must render a histogram drill-down.')
requireMatch(explorer, /Quantiles/, 'Profiling explorer must render a quantile drill-down.')
requireMatch(explorer, /p01[\s\S]*p05[\s\S]*p25[\s\S]*p50[\s\S]*p75[\s\S]*p95[\s\S]*p99/, 'Profiling explorer must preserve standard persisted quantiles.')
requireMatch(explorer, /Null rate[\s\S]*Blank rate[\s\S]*Zero rate[\s\S]*Distinct %/, 'Profiling explorer must expose core persisted column statistics.')
requireMatch(explorer, /selectedDistributions\.get\('HISTOGRAM'\)/, 'Histogram must be sourced from persisted distribution data.')
requireMatch(explorer, /selectedDistributions\.get\('QUANTILES'\)/, 'Quantiles must be sourced from persisted distribution data.')

requireMatch(dashboard, /Data Profiling[\s\S]*Data Observability[\s\S]*Data Quality/, 'Consolidated profiling dashboard must preserve the three frozen top-level workspaces.')
requireMatch(dashboard, /Profiling Summary[\s\S]*Document Statistics[\s\S]*Duplicate Analysis[\s\S]*Schema Overview[\s\S]*Sensitive Data Detection[\s\S]*Outlier Detection[\s\S]*Sample Data Preview/, 'Consolidated profiling dashboard must preserve the profiling sections and document-aware statistics.')
requireMatch(dashboard, /setDrilldown\(\{ kind: 'column'/, 'Column statistics and schema rows must support interactive drill-down.')
requireMatch(dashboard, /setDrilldown\(\{ kind: 'duplicates' \}\)/, 'Duplicate analysis must support interactive drill-down.')
requireMatch(dashboard, /setDrilldown\(\{ kind: 'sensitive' \}\)/, 'Sensitive-data analysis must support interactive drill-down.')
requireMatch(dashboard, /setDrilldown\(\{ kind: 'outliers' \}\)/, 'Outlier analysis must support interactive drill-down.')
requireMatch(dashboard, /setDrilldown\(\{ kind: 'sample' \}\)/, 'Sample data preview must support interactive drill-down.')
requireMatch(dashboard, /profile_distributions|distributionsByColumn/, 'Dashboard histograms must be backed by persisted profiling distributions.')
requireMatch(dashboard, /profiling\/explorer\?runId=.*columnId=/, 'Column drill-down must link to the full persisted profiling explorer.')
requireNoMatch(dashboard, /const fallback = \[2, 4, 7, 12/, 'Dashboard must never fabricate histogram bars when persisted distributions are absent.')
requireMatch(dashboard, /Not assessed[\s\S]*Readable PDF text was unavailable/, 'Sensitive-data UI must not report a false zero when PDF text is unreadable.')

requireMatch(documentEvidence, /documentEvidenceState/, 'Document evidence must have a deterministic readability gate.')
requireMatch(documentEvidence, /detectSensitiveTextEvidence/, 'Readable document evidence must support deterministic sensitive-text detection.')
requireMatch(governedFileSource, /nativeTextIsReadable/, 'Governed FILE loading must reject unreadable native PDF text.')
requireMatch(governedFileSource, /metadataOnlyFallback/, 'Unreadable native PDF text must fail closed to metadata-only evidence.')
requireMatch(governedFileSource, /Unreadable native text was replaced with governed OCR text/, 'Governed PDF loading must prefer readable OCR evidence when native text is rejected.')
requireMatch(canonicalPreview, /loadGovernedFileSource/, 'Canonical data preview must reuse the governed FILE reader rather than implement a separate extraction path.')
requireMatch(canonicalPreview, /loadCanonicalDocumentPreviewFromSource/, 'Canonical preview must expose a source-backed path that includes native extraction and OCR fallback.')
requireMatch(canonicalPreview, /Binary or encoded glyph streams are intentionally hidden/, 'Canonical preview must fail closed when readable text is unavailable.')
requireMatch(canonicalPreview, /sanitizePersistedMetricForPresentation/, 'Persisted profiling metrics must share a canonical presentation sanitizer.')

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
    documentReadabilityGate: true,
    noFabricatedHistograms: true,
    explorerEvidenceWithoutFindings: true,
    explorerUnreadableMetricSuppression: true,
    canonicalDocumentPreview: true,
    governedSourceReaderReuse: true,
    sharedSensitiveEvidence: true,
    sharedMetricSanitizer: true,
    authenticatedPreviewOnly: true,
  },
}, null, 2))
