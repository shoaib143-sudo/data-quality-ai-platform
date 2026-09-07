from pathlib import Path


def patch(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'Patch anchor missing in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

patch(
    'lib/connectors/jdbc.ts',
    "export function parseJdbcTableReference(value: string | null | undefined) {\n",
    "export function parseJdbcTableReference(value: string | null | undefined, defaultSchema: string | null = 'public') {\n",
)
patch(
    'lib/connectors/jdbc.ts',
    "  if (parts.length === 1) return { catalog: null, schema: 'public', table: parts[0] }\n",
    "  if (parts.length === 1) return { catalog: null, schema: defaultSchema, table: parts[0] }\n",
)

path = 'lib/profiling/jdbc-profile.ts'
p = Path(path)
text = p.read_text()
old = """  const jdbcUrl = firstString(metadata, ['jdbc_url', 'jdbcUrl', 'url'])
  const credentialRef = firstString(metadata, ['credential_ref', 'credentialRef', 'secret_ref', 'secretRef'])
  const parsedReference = parseJdbcTableReference(stringValue(executionSource.source_uri) ?? stringValue(datasetVersion.source_uri))
  const catalog = firstString(metadata,['catalog','catalog_name','catalogName','database','database_name','databaseName']) ?? parsedReference?.catalog ?? null
  const schema = firstString(metadata, ['schema', 'schema_name', 'schemaName']) ?? parsedReference?.schema ?? 'public'
  const table = firstString(metadata, ['table', 'table_name', 'tableName']) ?? parsedReference?.table
  if (!jdbcUrl || !credentialRef || !table || !safeIdentifier(schema) || !safeIdentifier(table) || (catalog && !safeIdentifier(catalog))) throw new Error('JDBC dataset source configuration is incomplete or invalid.')
"""
new = """  const jdbcUrl = firstString(metadata, ['jdbc_url', 'jdbcUrl', 'url'])
  const credentialRef = firstString(metadata, ['credential_ref', 'credentialRef', 'secret_ref', 'secretRef'])
  const engine = jdbcEngineFromUrl(jdbcUrl)
  const parsedReference = parseJdbcTableReference(
    stringValue(executionSource.source_uri) ?? stringValue(datasetVersion.source_uri),
    engine === 'SQLITE' ? null : 'public',
  )
  const catalog = firstString(metadata,['catalog','catalog_name','catalogName','database','database_name','databaseName']) ?? parsedReference?.catalog ?? null
  const schema = firstString(metadata, ['schema', 'schema_name', 'schemaName']) ?? parsedReference?.schema ?? (engine === 'POSTGRESQL' ? 'public' : null)
  const table = firstString(metadata, ['table', 'table_name', 'tableName']) ?? parsedReference?.table
  if (!jdbcUrl || !credentialRef || !table || (schema && !safeIdentifier(schema)) || !safeIdentifier(table) || (catalog && !safeIdentifier(catalog))) throw new Error('JDBC dataset source configuration is incomplete or invalid.')
"""
if old not in text:
    raise SystemExit('Profiling patch anchor missing')
text = text.replace(old, new, 1)
text = text.replace("  const connector={kind:'jdbc',engine:jdbcEngineFromUrl(jdbcUrl),catalog,schema,table}\n", "  const connector={kind:'jdbc',engine,catalog,schema,table}\n", 1)
p.write_text(text)
