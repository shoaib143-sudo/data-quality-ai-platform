from pathlib import Path

path = Path('lib/profiling/metric-engine.ts')
text = path.read_text()
old = """      const parsed = parseJdbcTableReference(typeof executionSource.source_uri === 'string' ? executionSource.source_uri : null)
      const jdbcUrl = stringField(['jdbc_url', 'jdbcUrl', 'url'])
      const credentialRef = stringField(['credential_ref', 'credentialRef', 'secret_ref', 'secretRef'])
      const schema = stringField(['schema', 'schema_name', 'schemaName']) ?? parsed?.schema ?? (jdbcEngineFromUrl(jdbcUrl) === 'SQLITE' ? null : 'public')
"""
new = """      const jdbcUrl = stringField(['jdbc_url', 'jdbcUrl', 'url'])
      const jdbcEngine = jdbcEngineFromUrl(jdbcUrl)
      const parsed = parseJdbcTableReference(typeof executionSource.source_uri === 'string' ? executionSource.source_uri : null, jdbcEngine === 'SQLITE' ? null : 'public')
      const credentialRef = stringField(['credential_ref', 'credentialRef', 'secret_ref', 'secretRef'])
      const schema = stringField(['schema', 'schema_name', 'schemaName']) ?? parsed?.schema ?? (jdbcEngine === 'SQLITE' ? null : 'public')
"""
if old not in text:
    raise SystemExit('SQLite parser default-schema target not found')
path.write_text(text.replace(old, new, 1))
