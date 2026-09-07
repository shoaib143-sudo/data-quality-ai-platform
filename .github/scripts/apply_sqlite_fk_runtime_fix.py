from pathlib import Path

path = Path('services/jdbc-bridge/src/main/java/com/datanexus/jdbcbridge/JdbcHierarchyController.java')
text = path.read_text()
old = '''  private static List<Map<String, Object>> readForeignKeys(DatabaseMetaData md, String catalog, String schema, String table) {
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
'''
new = '''  private static List<Map<String, Object>> readForeignKeys(DatabaseMetaData md, String catalog, String schema, String table) {
    try {
      String product = md.getDatabaseProductName();
      if (product != null && product.toLowerCase(Locale.ROOT).contains("sqlite")) {
        return readSqliteForeignKeys(md.getConnection(), table);
      }
    } catch (SQLException ignored) {}

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

  private static List<Map<String, Object>> readSqliteForeignKeys(Connection connection, String table) {
    List<Map<String, Object>> keys = new ArrayList<>();
    String quotedTable = table.replace("\\\"", "\\\"\\\"");
    try (var statement = connection.createStatement();
         ResultSet rs = statement.executeQuery("PRAGMA foreign_key_list(\\\"" + quotedTable + "\\\")")) {
      while (rs.next()) {
        Map<String, Object> key = new LinkedHashMap<>();
        Integer sequence = safeInt(rs, "seq");
        key.put("name", null);
        key.put("source_catalog", null);
        key.put("source_schema", null);
        key.put("source_table", table);
        key.put("source_column", blankToNull(safeGet(rs, "from")));
        key.put("target_catalog", null);
        key.put("target_schema", null);
        key.put("target_table", blankToNull(safeGet(rs, "table")));
        key.put("target_column", blankToNull(safeGet(rs, "to")));
        key.put("key_sequence", sequence == null ? null : sequence + 1);
        keys.add(key);
      }
    } catch (SQLException ignored) {}
    return keys;
  }
'''
if old not in text:
    raise SystemExit('target readForeignKeys method not found')
path.write_text(text.replace(old, new))
