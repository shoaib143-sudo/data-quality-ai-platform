import fs from 'node:fs'

const text = fs.readFileSync('lib/profiling/metric-engine.ts', 'utf8')
const expected = "loadJdbcRows({ jdbcUrl, credentialRef, schema, table, catalog: parsed?.catalog ?? null }, maxRows)"
if (!text.includes(expected)) {
  console.error('Databricks/JDBC profiling row load must preserve parsed catalog')
  process.exit(1)
}
console.log('Databricks metric catalog propagation contract verified')
