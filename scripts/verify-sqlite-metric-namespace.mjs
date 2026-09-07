import fs from 'node:fs'

const source = fs.readFileSync('lib/profiling/metric-engine.ts', 'utf8')

const required = [
  "const jdbcEngine = jdbcEngineFromUrl(jdbcUrl)",
  "parseJdbcTableReference(typeof executionSource.source_uri === 'string' ? executionSource.source_uri : null, jdbcEngine === 'SQLITE' ? null : 'public')",
  "const schema = stringField(['schema', 'schema_name', 'schemaName']) ?? parsed?.schema ?? (jdbcEngine === 'SQLITE' ? null : 'public')",
]

for (const contract of required) {
  if (!source.includes(contract)) {
    throw new Error(`SQLite metric namespace contract missing: ${contract}`)
  }
}

const parsedBeforeEngine = source.indexOf('const parsed = parseJdbcTableReference') < source.indexOf('const jdbcEngine = jdbcEngineFromUrl(jdbcUrl)')
if (parsedBeforeEngine) {
  throw new Error('SQLite metric namespace parser must resolve JDBC engine before applying a default schema.')
}

console.log('SQLite metric namespace contract verified.')
