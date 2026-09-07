from pathlib import Path

path = Path('lib/profiling/metric-engine.ts')
text = path.read_text()
old = "      const loaded = await loadJdbcRows({ jdbcUrl, credentialRef, schema, table }, maxRows)\n"
new = "      const loaded = await loadJdbcRows({ jdbcUrl, credentialRef, schema, table, catalog: parsed?.catalog ?? null }, maxRows)\n"
if old not in text:
    raise SystemExit('Expected JDBC profiling row-load call not found')
path.write_text(text.replace(old, new, 1))
