from pathlib import Path

path = Path('lib/profiling/metric-engine.ts')
text = path.read_text()
text = text.replace(
    "import { loadJdbcRows, parseJdbcTableReference } from '@/lib/connectors/jdbc'",
    "import { jdbcEngineFromUrl, loadJdbcRows, parseJdbcTableReference } from '@/lib/connectors/jdbc'",
)
old = "const schema = stringField(['schema', 'schema_name', 'schemaName']) ?? parsed?.schema ?? 'public'"
new = "const schema = stringField(['schema', 'schema_name', 'schemaName']) ?? parsed?.schema ?? (jdbcEngineFromUrl(jdbcUrl) === 'SQLITE' ? null : 'public')"
if old not in text:
    raise SystemExit('SQLite metric schema fallback target not found')
text = text.replace(old, new)
path.write_text(text)
