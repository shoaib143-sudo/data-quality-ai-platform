from pathlib import Path


def replace(path: str, old: str, new: str, count: int = -1) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected patch anchor missing: {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count))


replace(
    "services/jdbc-bridge/pom.xml",
    "    <dependency><groupId>com.oracle.database.jdbc</groupId><artifactId>ojdbc11</artifactId><version>23.26.3.0.0</version></dependency>\n",
    "    <dependency><groupId>com.oracle.database.jdbc</groupId><artifactId>ojdbc11</artifactId><version>23.26.3.0.0</version></dependency>\n"
    "    <dependency><groupId>org.xerial</groupId><artifactId>sqlite-jdbc</artifactId><version>3.53.4.0</version></dependency>\n",
)

replace(
    "services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/CredentialStore.java",
    '  private static final String MODE_ENVIRONMENT = "environment";\n',
    '  private static final String MODE_ENVIRONMENT = "environment";\n'
    '  public static final String SQLITE_FILE_CREDENTIAL_REF = "sqlite-file-readonly";\n',
)
replace(
    "services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/CredentialStore.java",
    "  public Credentials resolve(String credentialRef) throws Exception {\n    validateCredentialRef(credentialRef);\n",
    "  public Credentials resolve(String credentialRef) throws Exception {\n    validateCredentialRef(credentialRef);\n"
    '    if (SQLITE_FILE_CREDENTIAL_REF.equals(credentialRef)) return new Credentials("_sqlite_file_", "_sqlite_file_");\n',
)
replace(
    "services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/CredentialStore.java",
    "  public void upsert(String credentialRef, String username, String password) throws Exception {\n    validateCredentialRef(credentialRef);\n",
    "  public void upsert(String credentialRef, String username, String password) throws Exception {\n    validateCredentialRef(credentialRef);\n"
    '    if (SQLITE_FILE_CREDENTIAL_REF.equals(credentialRef)) throw new IllegalArgumentException("The reserved SQLite file credential reference is not writable.");\n',
)

controller = "services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcBridgeController.java"
replace(
    controller,
    '      "PostgreSQL", "Microsoft SQL Server", "MySQL", "MariaDB", "Databricks", "Snowflake", "Amazon Redshift", "Oracle", "Generic JDBC"\n',
    '      "PostgreSQL", "Microsoft SQL Server", "MySQL", "MariaDB", "Databricks", "Snowflake", "Amazon Redshift", "Oracle", "SQLite", "Generic JDBC"\n',
)
replace(controller, "      connection.setReadOnly(true);\n", "      enforceReadOnly(connection);\n")
replace(
    controller,
    "  private static void requireNamespace(Namespace namespace) {\n    if ((namespace.catalog() == null || namespace.catalog().isBlank()) && (namespace.schema() == null || namespace.schema().isBlank())) {\n",
    "  private static void requireNamespace(Namespace namespace) {\n    if ((namespace.catalog() == null || namespace.catalog().isBlank()) && (namespace.schema() == null || namespace.schema().isBlank()) && !isSqlite(namespace.product())) {\n",
)
replace(
    controller,
    '    if (lower.contains("sql server")) {\n',
    '''    if (lower.contains("sqlite")) {
      String sql = "SELECT NULL AS table_catalog, NULL AS table_schema, name AS table_name, sql AS view_definition FROM sqlite_master WHERE type='view'" +
          (table == null || table.isBlank() ? "" : " AND name=?");
      queries.add(new ViewQuery(sql, params(null, table), "table_catalog", "table_schema", "table_name", "view_definition"));
      return queries;
    } else if (lower.contains("sql server")) {
''',
    1,
)
replace(
    controller,
    "  private static boolean isCatalogDatabase(String product) {\n",
    '''  private static void enforceReadOnly(Connection connection) throws SQLException {
    String product = connection.getMetaData().getDatabaseProductName();
    if (isSqlite(product)) {
      try (Statement statement = connection.createStatement()) { statement.execute("PRAGMA query_only = ON"); }
      return;
    }
    connection.setReadOnly(true);
  }

  private static boolean isSqlite(String product) {
    return product != null && product.toLowerCase(Locale.ROOT).contains("sqlite");
  }

  private static boolean isCatalogDatabase(String product) {
''',
)

hierarchy = "services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcHierarchyController.java"
replace(hierarchy, "      connection.setReadOnly(true);\n", "      enforceReadOnly(connection);\n")
replace(
    hierarchy,
    '        metadata.put("type_name", blankToNull(safeGet(rs, "TYPE_NAME")));\n',
    '        metadata.put("type_name", blankToNull(safeGet(rs, "TYPE_NAME")));\n'
    '        metadata.put("primary_keys", readPrimaryKeys(md, resolvedCatalog, resolvedSchema, name));\n'
    '        metadata.put("foreign_keys", readForeignKeys(md, resolvedCatalog, resolvedSchema, name));\n',
)
replace(
    hierarchy,
    "  private static void readColumns(HierarchyBuilder builder, DatabaseMetaData md, String parentId, String catalog, String schema, String table, String parentQualified) {\n",
    '''  private static List<Map<String, Object>> readPrimaryKeys(DatabaseMetaData md, String catalog, String schema, String table) {
    List<Map<String, Object>> keys = new ArrayList<>();
    try (ResultSet rs = md.getPrimaryKeys(catalog, schema, table)) {
      while (rs.next()) {
        Map<String, Object> key = new LinkedHashMap<>();
        key.put("column", blankToNull(safeGet(rs, "COLUMN_NAME")));
        key.put("key_sequence", safeInt(rs, "KEY_SEQ"));
        key.put("name", blankToNull(safeGet(rs, "PK_NAME")));
        keys.add(key);
      }
    } catch (SQLException ignored) {}
    return keys;
  }

  private static List<Map<String, Object>> readForeignKeys(DatabaseMetaData md, String catalog, String schema, String table) {
    List<Map<String, Object>> keys = new ArrayList<>();
    try (ResultSet rs = md.getImportedKeys(catalog, schema, table)) {
      while (rs.next()) {
        Map<String, Object> key = new LinkedHashMap<>();
        key.put("name", blankToNull(safeGet(rs, "FK_NAME")));
        key.put("source_catalog", blankToNull(safeGet(rs, "FKTABLE_CAT")));
        key.put("source_schema", blankToNull(safeGet(rs, "FKTABLE_SCHEM")));
        key.put("source_table", blankToNull(safeGet(rs, "FKTABLE_NAME")));
        key.put("source_column", blankToNull(safeGet(rs, "FKCOLUMN_NAME")));
        key.put("target_catalog", blankToNull(safeGet(rs, "PKTABLE_CAT")));
        key.put("target_schema", blankToNull(safeGet(rs, "PKTABLE_SCHEM")));
        key.put("target_table", blankToNull(safeGet(rs, "PKTABLE_NAME")));
        key.put("target_column", blankToNull(safeGet(rs, "PKCOLUMN_NAME")));
        key.put("key_sequence", safeInt(rs, "KEY_SEQ"));
        keys.add(key);
      }
    } catch (SQLException ignored) {}
    return keys;
  }

  private static void readColumns(HierarchyBuilder builder, DatabaseMetaData md, String parentId, String catalog, String schema, String table, String parentQualified) {
''',
)
replace(
    hierarchy,
    "  private static String nativeRootLabel(String product) {\n",
    '''  private static void enforceReadOnly(Connection connection) throws SQLException {
    String product = connection.getMetaData().getDatabaseProductName();
    if (product != null && product.toLowerCase(Locale.ROOT).contains("sqlite")) {
      try (var statement = connection.createStatement()) { statement.execute("PRAGMA query_only = ON"); }
      return;
    }
    connection.setReadOnly(true);
  }

  private static String nativeRootLabel(String product) {
''',
)
replace(
    hierarchy,
    '    if (value.contains("postgres")) return "database";\n',
    '    if (value.contains("postgres")) return "database";\n    if (value.contains("sqlite")) return "database";\n',
)

jdbc = "lib/connectors/jdbc.ts"
replace(
    jdbc,
    "function isDatabricksJdbcUrl(value: unknown) {\n  return typeof value === 'string' && value.trim().toLowerCase().startsWith('jdbc:databricks://')\n}\n",
    "function isDatabricksJdbcUrl(value: unknown) {\n  return typeof value === 'string' && value.trim().toLowerCase().startsWith('jdbc:databricks://')\n}\n\n"
    "function isSqliteJdbcUrl(value: unknown) {\n  return typeof value === 'string' && value.trim().toLowerCase().startsWith('jdbc:sqlite:')\n}\n",
)
replace(
    jdbc,
    "  if (url.startsWith('jdbc:oracle:')) return 'ORACLE'\n  return 'GENERIC_JDBC'\n",
    "  if (url.startsWith('jdbc:oracle:')) return 'ORACLE'\n  if (url.startsWith('jdbc:sqlite:')) return 'SQLITE'\n  return 'GENERIC_JDBC'\n",
)
replace(
    jdbc,
    "  if (!schema && !catalog && !isPostgresJdbcUrl(jdbcUrl)) throw new Error('JDBC object namespace requires a catalog/database or schema.')\n",
    "  if (!schema && !catalog && !isPostgresJdbcUrl(jdbcUrl) && !isSqliteJdbcUrl(jdbcUrl)) throw new Error('JDBC object namespace requires a catalog/database or schema.')\n",
)

replace(
    "services/jdbc-bridge/Dockerfile",
    "COPY --from=build /workspace/target/app.jar /app/app.jar\nUSER 10001\n",
    "COPY --from=build /workspace/target/app.jar /app/app.jar\n"
    "RUN mkdir -p /app/sqlite-sources && chown 10001:10001 /app/sqlite-sources\n"
    "ADD --chown=10001:10001 --chmod=0444 --checksum=sha256:bdf635be69850bd3be09c9a2dbeef7ddfb80036bd3ef3381383cd03b61e4a61a https://raw.githubusercontent.com/dbeaver/dbeaver/b59edd36ff94abfea48f5151a5ea10b3791137f0/plugins/org.jkiss.dbeaver.ui.config.sample/data/Chinook.db /app/sqlite-sources/Chinook.db\n"
    "USER 10001\n",
)

Path("services/jdbc-bridge/src/test/java/com/datanexus/jdbcbridge/SqliteSupportTest.java").write_text('''package com.datanexus.jdbcbridge;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.sql.DriverManager;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqliteSupportTest {
  @Test
  void sqliteDriverSupportsReadOnlyMetadataAndForeignKeys() throws Exception {
    var file = Files.createTempFile("datanexus-sqlite-", ".db");
    try {
      try (var connection = DriverManager.getConnection("jdbc:sqlite:" + file)) {
        try (var statement = connection.createStatement()) {
          statement.execute("PRAGMA foreign_keys = ON");
          statement.execute("CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
          statement.execute("CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id))");
          statement.execute("INSERT INTO parent VALUES (1, 'p')");
          statement.execute("INSERT INTO child VALUES (1, 1)");
        }
      }
      var url = "jdbc:sqlite:file:" + file + "?mode=ro&immutable=1&jdbc.explicit_readonly=true";
      try (var connection = DriverManager.getConnection(url, "_sqlite_file_", "_sqlite_file_")) {
        try (var statement = connection.createStatement()) { statement.execute("PRAGMA query_only = ON"); }
        var md = connection.getMetaData();
        assertEquals("SQLite", md.getDatabaseProductName());
        try (var foreignKeys = md.getImportedKeys(null, null, "child")) {
          assertTrue(foreignKeys.next());
          assertEquals("parent", foreignKeys.getString("PKTABLE_NAME"));
          assertEquals("parent_id", foreignKeys.getString("FKCOLUMN_NAME"));
        }
      }
    } finally {
      Files.deleteIfExists(file);
    }
  }
}
''')
