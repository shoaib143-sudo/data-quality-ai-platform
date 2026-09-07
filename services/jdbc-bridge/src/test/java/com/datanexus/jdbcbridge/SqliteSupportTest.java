package com.datanexus.jdbcbridge;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNotNull;

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

  @Test
  void chinookForeignKeysAreReadableThroughSqlitePragma() throws Exception {
    var resource = Path.of("/tmp/Chinook.db");
    try (var input = new java.net.URL("https://raw.githubusercontent.com/dbeaver/dbeaver/b59edd36ff94abfea48f5151a5ea10b3791137f0/plugins/org.jkiss.dbeaver.ui.config.sample/data/Chinook.db").openStream()) {
      Files.copy(input, resource, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }
    try (var connection = DriverManager.getConnection("jdbc:sqlite:" + resource)) {
      int foreignKeys = 0;
      try (var tables = connection.getMetaData().getTables(null, null, "%", new String[]{"TABLE"})) {
        while (tables.next()) {
          var table = tables.getString("TABLE_NAME");
          try (var statement = connection.createStatement(); var rs = statement.executeQuery("PRAGMA foreign_key_list(\"" + table.replace("\"", "\"\"") + "\")")) {
            while (rs.next()) {
              assertNotNull(rs.getString("table"));
              assertNotNull(rs.getString("from"));
              foreignKeys++;
            }
          }
        }
      }
      assertEquals(11, foreignKeys);
    } finally {
      Files.deleteIfExists(resource);
    }
  }
}
