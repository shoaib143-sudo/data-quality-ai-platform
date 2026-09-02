package com.datanexus.jdbcbridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import javax.sql.DataSource;
import java.sql.*;
import java.util.*;

@RestController
public class JdbcBridgeController {
  private static final int MAX_ROWS = 10_000;
  private final ObjectMapper mapper;
  private final CredentialStore credentials;

  public JdbcBridgeController(ObjectMapper mapper, CredentialStore credentials) {
    this.mapper = mapper;
    this.credentials = credentials;
  }

  @GetMapping("/health")
  public Map<String, Object> health() {
    return Map.of("status", "ok", "service", "datanexus-jdbc-bridge");
  }

  @PostMapping("/v1/validate")
  public ValidateResponse validate(@Valid @RequestBody JdbcRequest request) throws Exception {
    validateJdbcUrl(request.jdbcUrl());
    validateIdentifier(request.schema(), "schema");
    validateIdentifier(request.table(), "table");
    Credentials c = credentials.resolve(request.credentialRef());
    try (Connection connection = DriverManager.getConnection(request.jdbcUrl(), c.username(), c.password())) {
      DatabaseMetaData md = connection.getMetaData();
      List<ColumnInfo> columns = readColumns(md, request.schema(), request.table());
      if (columns.isEmpty()) throw new IllegalArgumentException("JDBC table was not found or has no visible columns.");
      long rowCount = countRows(connection, request.schema(), request.table());
      return new ValidateResponse(true, columns, rowCount, Map.of("database_product", md.getDatabaseProductName(), "driver_version", md.getDriverVersion()), List.of());
    }
  }

  @PostMapping("/v1/query")
  public QueryResponse query(@Valid @RequestBody JdbcQueryRequest request) throws Exception {
    validateJdbcUrl(request.jdbcUrl());
    validateIdentifier(request.schema(), "schema");
    validateIdentifier(request.table(), "table");
    int limit = Math.min(Math.max(request.limit() == null ? 100 : request.limit(), 1), MAX_ROWS);
    Credentials c = credentials.resolve(request.credentialRef());
    try (Connection connection = DriverManager.getConnection(request.jdbcUrl(), c.username(), c.password())) {
      String table = qualifiedTable(connection.getMetaData(), request.schema(), request.table());
      String sql = "SELECT * FROM " + table;
      try (PreparedStatement statement = connection.prepareStatement(sql)) {
        statement.setMaxRows(limit);
        statement.setFetchSize(Math.min(limit, 1000));
        try (ResultSet rs = statement.executeQuery()) {
          ResultSetMetaData meta = rs.getMetaData();
          List<Map<String, Object>> rows = new ArrayList<>();
          while (rs.next() && rows.size() < limit) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= meta.getColumnCount(); i++) row.put(meta.getColumnLabel(i), rs.getObject(i));
            rows.add(row);
          }
          List<ColumnInfo> columns = new ArrayList<>();
          for (int i = 1; i <= meta.getColumnCount(); i++) columns.add(new ColumnInfo(meta.getColumnLabel(i), meta.getColumnTypeName(i)));
          return new QueryResponse(rows, null, columns);
        }
      }
    }
  }

  private static List<ColumnInfo> readColumns(DatabaseMetaData md, String schema, String table) throws SQLException {
    List<ColumnInfo> columns = new ArrayList<>();
    try (ResultSet rs = md.getColumns(null, schema, table, null)) {
      while (rs.next()) columns.add(new ColumnInfo(rs.getString("COLUMN_NAME"), rs.getString("TYPE_NAME")));
    }
    return columns;
  }

  private static long countRows(Connection connection, String schema, String table) throws SQLException {
    String qualified = qualifiedTable(connection.getMetaData(), schema, table);
    try (Statement statement = connection.createStatement(); ResultSet rs = statement.executeQuery("SELECT COUNT(*) FROM " + qualified)) {
      rs.next();
      return rs.getLong(1);
    }
  }

  private static String qualifiedTable(DatabaseMetaData md, String schema, String table) throws SQLException {
    String quote = md.getIdentifierQuoteString();
    if (quote == null || quote.isBlank()) return schema + "." + table;
    return quote + schema.replace(quote, quote + quote) + quote + "." + quote + table.replace(quote, quote + quote) + quote;
  }

  private static void validateIdentifier(String value, String field) {
    if (value == null || !value.matches("[A-Za-z_][A-Za-z0-9_$]*")) throw new IllegalArgumentException(field + " contains invalid identifier characters.");
  }

  private static void validateJdbcUrl(String url) {
    if (url == null || !url.startsWith("jdbc:")) throw new IllegalArgumentException("jdbcUrl must be a JDBC URL.");
    if (url.matches("(?i).*jdbc:[^:]+://[^/\\s:@]+:[^/\\s@]+@.*") || url.matches("(?i).*jdbc:[^:]+://[^/\\s@]+@.*")) throw new IllegalArgumentException("jdbcUrl must not contain embedded credentials.");
  }

  public record JdbcRequest(@NotBlank String jdbcUrl, @NotBlank String credentialRef, @NotBlank @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$]*") String schema, @NotBlank @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$]*") String table) {}
  public record JdbcQueryRequest(@NotBlank String jdbcUrl, @NotBlank String credentialRef, @NotBlank @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$]*") String schema, @NotBlank @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$]*") String table, Integer limit) {}
  public record ColumnInfo(String name, String type) {}
  public record ValidateResponse(boolean valid, List<ColumnInfo> columns, Long rowCount, Map<String,Object> details, List<String> warnings) {}
  public record QueryResponse(List<Map<String,Object>> rows, Long rowCount, List<ColumnInfo> columns) {}

  @ResponseStatus(HttpStatus.BAD_REQUEST)
  @ExceptionHandler({IllegalArgumentException.class})
  Map<String,String> badRequest(Exception e) { return Map.of("error", e.getMessage() == null ? "Invalid request" : e.getMessage()); }
}
