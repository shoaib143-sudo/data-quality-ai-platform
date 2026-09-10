import fs from 'node:fs'

// One-shot guarded patch used to remove the metadata-only profiling fallback.
const path = 'lib/profiling/executor.ts'
const source = fs.readFileSync(path, 'utf8')
const before = `  const summary = sourceRows && connector
    ? buildSourceBackedDatasetProfileSummary(
      datasetVersion,
      connector,
      sourceRows.rows,
      sourceRows.rowCount,
    )
    : buildDatasetProfileSummary(
      datasetVersion,
      connector
        ? [
          \`Source connector \${connector.schema}.\${connector.table} returned no rows; used metadata-only profile.\`,
        ]
        : [
          'No supported source-row connector was defined; used metadata-only profile.',
        ],
    )
`
const after = `  if (!connector) {
    throw new Error(
      'Unable to profile dataset version: no trusted source-row connector is configured.',
    )
  }

  if (!sourceRows || sourceRows.rows.length === 0) {
    throw new Error(
      \`Unable to profile dataset version: trusted source \${connector.schema}.\${connector.table} returned no rows. Metadata-only evidence is not accepted.\`,
    )
  }

  const summary = buildSourceBackedDatasetProfileSummary(
    datasetVersion,
    connector,
    sourceRows.rows,
    sourceRows.rowCount,
  )
`

if (source.includes(after)) {
  console.log('Profiling trust boundary already enforced.')
  process.exit(0)
}
if (!source.includes(before)) {
  throw new Error('Expected metadata-only profiling fallback block was not found; refusing an unsafe patch.')
}
fs.writeFileSync(path, source.replace(before, after))
console.log('Removed metadata-only profiling evidence fallback.')
