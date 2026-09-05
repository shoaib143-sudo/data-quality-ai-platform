package com.datanexus.jdbcbridge;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.*;
import java.util.*;

@RestController
public class JdbcBridgeController {
  private static final int TECHNICAL_MAX_ROWS = environmentInt("JDBC_BRIDGE_TECHNICAL_MAX_ROWS", 250_000, 1_000, 1_000_000);
  private static final List<String> SUPPORTED_ENGINES = List.of(
      "PostgreSQL", "Microsoft SQL Server", "MySQL", "MariaDB", "Databricks", "Snowflake", "Amazon Redshift", "Oracle", "Generic JDBC"
  );
  private final CredentialStore credentials;

  public JdbcBridgeController(CredentialStore credentials) { this.credentials = credentials; }

  @GetMapping("/health")
  public Map<String, Object> health() {
    return Map.of(
        "status", "ok",
        "service", "datanexus-jdbc-bridge",
        "supported_engines", SUPPORTED_ENGINES,
        "technical_max_rows", TECHNICAL_MAX_ROWS
    );
  }

  @PostMapping("/v1/credentials")
  public CredentialResponse saveCredential(@Valid @RequestBody CredentialRequest request) throws Exception {
    credentials.upsert(request.credentialRef(), request.username(), request.password());
    return new CredentialResponse(true, request.credentialRef());
  }

  @PostMapping("/v1/catalog")
  public CatalogResponse catalog(@Valid @RequestBody JdbcCatalogRequest request) throws Exception {
    validateJdbcUrl(request.jdbcUrl());
    validateOptionalIdentifier(request.schema(), "schema");
    validateOptionalIdentifier(request.catalog(), "catalog");
    Credentials c = credentials.resolve(request.credentialRef());
    try (Connection connection = DriverManager.getConnection(request.jdbcUrl(), c.username(), c.password())) {
      connection.setReadOnly(true);
      DatabaseMetaData md = connection.getMetaData();
      String product = md.getDatabaseProductName();
      List<String> schemas = readNamespaces(md, product);
      Namespace namespace = namespace(connection, md, request.catalog(), request.schema());
      boolean namespaceProvided = (request.schema() != null && !request.schema().isBlank()) || (isCatalogDatabase(product) && request.catalog() != null && !request.catalog().isBlank());
      List<TableInfo> tables = namespaceProvided ? readTables(md, namespace) : List.of();
      Map<String, Object> details = databaseDetails(connection, md, namespace);
      return new CatalogResponse(schemas, tables, details);
    }
  }

  @PostMapping("/v1/validate")
  public ValidateResponse validate(@Valid @RequestBody JdbcRequest request) throws Exception {
    validateJdbcUrl(request.jdbcUrl());
    validateOptionalIdentifier(request.schema(), "schema");
    validateIdentifier(request.table(), "table");
    validateOptionalIdentifier(request.catalog(), "catalog");
    Credentials c = credentials.resolve(request.credentialRef());
    try (Connection connection = DriverManager.getConnection(request.jdbcUrl(), c.username(), c.password())) {
      connection.setReadOnly(true);
      DatabaseMetaData md = connection.getMetaData();
      Namespace namespace = namespace(connection, md, request.catalog(), request.schema());
      requireNamespace(namespace);
      List<ColumnInfo> columns = readColumns(md, namespace, request.table());
      if (columns.isEmpty()) throw new IllegalArgumentException("JDBC table was not found or has no visible columns.");
      long rowCount = countRows(connection, namespace, request.table());
      return new ValidateResponse(true, columns, rowCount, databaseDetails(connection, md, namespace), List.of());
    }
  }

  @PostMapping("/v1/query")
  public QueryResponse query(@Valid @RequestBody JdbcQueryRequest request) throws Exception {
    validateJdbcUrl(request.jdbcUrl());
    validateOptionalIdentifier(request.schema(), "schema");
    validateIdentifier(request.table(), "table");
    validateOptionalIdentifier(request.catalog(), "catalog");
    int requestedLimit = request.limit() == null ? 100 : request.limit();
    if (requestedLimit < 1) throw new IllegalArgumentException("limit must be greater than zero.");
    int limit = Math.min(requestedLimit, TECHNICAL_MAX_ROWS);
    Credentials c = credentials.resolve(request.credentialRef());
    try (Connection connection = DriverManager.getConnection(request.jdbcUrl(), c.username(), c.password())) {
      connection.setReadOnly(true);
      DatabaseMetaData md = connection.getMetaData();
      Namespace namespace = namespace(connection, md, request.catalog(), request.schema());
      requireNamespace(namespace);
      String table = qualifiedTable(md, namespace, request.table());
      String sql = "SELECT * FROM " + table;
      try (PreparedStatement statement = connection.prepareStatement(sql)) {
        statement.setMaxRows(limit);
        statement.setFetchSize(Math.min(limit, 2_000));
        statement.setQueryTimeout(120);
        try (ResultSet rs = statement.executeQuery()) {
          ResultSetMetaData meta = rs.getMetaData();
          List<Map<String, Object>> rows = new ArrayList<>();
          while (rs.next() && rows.size() < limit) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= meta.getColumnCount(); i++) row.put(meta.getColumnLabel(i), rs.getObject(i));
            rows.add(row);
          }
          List<ColumnInfo> columns = resultColumns(meta);
          List<String> warnings = requestedLimit > TECHNICAL_MAX_ROWS
              ? List.of("Requested row count exceeded the bridge technical safety ceiling; returned " + TECHNICAL_MAX_ROWS + " rows at most.")
              : List.of();
          return new QueryResponse(rows, null, columns, warnings);
        }
      }
    }
  }

  @PostMapping("/v1/lineage")
  public LineageResponse lineage(@Valid @RequestBody JdbcLineageRequest request) throws Exception {
    validateJdbcUrl(request.jdbcUrl());
    validateOptionalIdentifier(request.schema(), "schema");
    validateOptionalIdentifier(request.catalog(), "catalog");
    validateOptionalIdentifier(request.table(), "table");
    Credentials c = credentials.resolve(request.credentialRef());
    try (Connection connection = DriverManager.getConnection(request.jdbcUrl(), c.username(), c.password())) {
      connection.setReadOnly(true);
      DatabaseMetaData md = connection.getMetaData();
      Namespace namespace = namespace(connection, md, request.catalog(), request.schema());
      requireNamespace(namespace);
      List<String> warnings = new ArrayList<>();
      List<TransformationInfo> transformations = readViewTransformations(connection, md, namespace, request.table(), warnings);
      return new LineageResponse(
          md.getDatabaseProductName(),
          md.getDatabaseProductVersion(),
          namespace.catalog(),
          namespace.schema(),
          transformations,
          warnings
      );
    }
  }

  private static List<String> readNamespaces(DatabaseMetaData md, String product) throws SQLException {
    Set<String> namespaces = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
    boolean catalogAsNamespace = isCatalogDatabase(product);
    if (catalogAsNamespace) {
      try (ResultSet rs = md.getCatalogs()) {
        while (rs.next()) {
          String catalog = rs.getString("TABLE_CAT");
          if (catalog != null && !catalog.isBlank() && !isSystemSchema(catalog)) namespaces.add(catalog);
        }
      }
    } else {
      try (ResultSet rs = md.getSchemas()) {
        while (rs.next()) {
          String schema = rs.getString("TABLE_SCHEM");
          if (schema != null && !schema.isBlank() && !isSystemSchema(schema)) namespaces.add(schema);
        }
      }
      if (namespaces.isEmpty()) {
        try (ResultSet rs = md.getCatalogs()) {
          while (rs.next()) {
            String catalog = rs.getString("TABLE_CAT");
            if (catalog != null && !catalog.isBlank() && !isSystemSchema(catalog)) namespaces.add(catalog);
          }
        }
      }
    }
    return new ArrayList<>(namespaces);
  }

  private static Namespace namespace(Connection connection, DatabaseMetaData md, String requestedCatalog, String requestedSchema) throws SQLException {
    String product = md.getDatabaseProductName();
    if (isCatalogDatabase(product)) {
      String catalog = firstNonBlank(requestedCatalog, requestedSchema, connection.getCatalog());
      return new Namespace(catalog, null, product);
    }
    String catalog = firstNonBlank(requestedCatalog, usesCatalogQualifier(product) ? connection.getCatalog() : null);
    return new Namespace(catalog, requestedSchema, product);
  }

  private static void requireNamespace(Namespace namespace) {
    if ((namespace.catalog() == null || namespace.catalog().isBlank()) && (namespace.schema() == null || namespace.schema().isBlank())) {
      throw new IllegalArgumentException("Database namespace is incomplete; the driver must report a catalog/database or schema for the selected object.");
    }
  }

  private static List<TableInfo> readTables(DatabaseMetaData md, Namespace namespace) throws SQLException {
    List<TableInfo> tables = new ArrayList<>();
    try (ResultSet rs = md.getTables(namespace.catalog(), namespace.schema(), "%", new String[]{"TABLE", "VIEW", "MATERIALIZED VIEW", "FOREIGN TABLE"})) {
      while (rs.next()) {
        String name = rs.getString("TABLE_NAME");
        String type = rs.getString("TABLE_TYPE");
        if (name != null && !name.isBlank()) {
          tables.add(new TableInfo(name, type, safeGet(rs, "TABLE_CAT"), safeGet(rs, "TABLE_SCHEM"), safeGet(rs, "REMARKS")));
        }
      }
    }
    tables.sort(Comparator.comparing(TableInfo::name, String.CASE_INSENSITIVE_ORDER));
    return tables;
  }

  private static boolean isSystemSchema(String schema) {
    String normalized = schema.toLowerCase(Locale.ROOT);
    return normalized.equals("information_schema") || normalized.equals("pg_catalog") || normalized.equals("mysql")
        || normalized.equals("performance_schema") || normalized.equals("sys") || normalized.startsWith("pg_toast");
  }

  private static List<ColumnInfo> readColumns(DatabaseMetaData md, Namespace namespace, String table) throws SQLException {
    List<ColumnInfo> columns = new ArrayList<>();
    try (ResultSet rs = md.getColumns(namespace.catalog(), namespace.schema(), table, null)) {
      while (rs.next()) {
        columns.add(new ColumnInfo(
            rs.getString("COLUMN_NAME"),
            rs.getString("TYPE_NAME"),
            safeInt(rs, "COLUMN_SIZE"),
            safeInt(rs, "DECIMAL_DIGITS"),
            "YES".equalsIgnoreCase(safeGet(rs, "IS_NULLABLE")),
            safeGet(rs, "COLUMN_DEF")
        ));
      }
    }
    return columns;
  }

  private static List<ColumnInfo> resultColumns(ResultSetMetaData meta) throws SQLException {
    List<ColumnInfo> columns = new ArrayList<>();
    for (int i = 1; i <= meta.getColumnCount(); i++) {
      columns.add(new ColumnInfo(meta.getColumnLabel(i), meta.getColumnTypeName(i), meta.getPrecision(i), meta.getScale(i), meta.isNullable(i) != ResultSetMetaData.columnNoNulls, null));
    }
    return columns;
  }

  private static long countRows(Connection connection, Namespace namespace, String table) throws SQLException {
    String qualified = qualifiedTable(connection.getMetaData(), namespace, table);
    try (Statement statement = connection.createStatement()) {
      statement.setQueryTimeout(120);
      try (ResultSet rs = statement.executeQuery("SELECT COUNT(*) FROM " + qualified)) {
        rs.next();
        return rs.getLong(1);
      }
    }
  }

  private static String qualifiedTable(DatabaseMetaData md, Namespace namespace, String table) throws SQLException {
    String product = namespace.product();
    if (isCatalogDatabase(product)) return quoteIdentifier(md, namespace.catalog()) + "." + quoteIdentifier(md, table);
    if (usesCatalogQualifier(product) && namespace.catalog() != null && !namespace.catalog().isBlank()) {
      return quoteIdentifier(md, namespace.catalog()) + "." + quoteIdentifier(md, namespace.schema()) + "." + quoteIdentifier(md, table);
    }
    if (namespace.schema() == null || namespace.schema().isBlank()) return quoteIdentifier(md, table);
    return quoteIdentifier(md, namespace.schema()) + "." + quoteIdentifier(md, table);
  }

  private static String quoteIdentifier(DatabaseMetaData md, String value) throws SQLException {
    if (value == null || value.isBlank()) throw new IllegalArgumentException("Database namespace is incomplete.");
    String quote = md.getIdentifierQuoteString();
    if (quote == null || quote.isBlank()) return value;
    return quote + value.replace(quote, quote + quote) + quote;
  }

  private static List<TransformationInfo> readViewTransformations(Connection connection, DatabaseMetaData md, Namespace namespace, String requestedTable, List<String> warnings) {
    String product = mdProduct(md);
    List<TransformationInfo> result = new ArrayList<>();
    List<ViewQuery> candidates = viewQueries(product, namespace, requestedTable);
    SQLException last = null;
    for (ViewQuery candidate : candidates) {
      try (PreparedStatement statement = connection.prepareStatement(candidate.sql())) {
        int index = 1;
        for (String param : candidate.params()) statement.setString(index++, param);
        statement.setQueryTimeout(60);
        try (ResultSet rs = statement.executeQuery()) {
          while (rs.next()) {
            String catalog = candidate.catalogColumn() == null ? namespace.catalog() : safeGet(rs, candidate.catalogColumn());
            String schema = candidate.schemaColumn() == null ? namespace.schema() : safeGet(rs, candidate.schemaColumn());
            String name = safeGet(rs, candidate.nameColumn());
            String logic = safeGet(rs, candidate.logicColumn());
            if (name == null || logic == null || logic.isBlank()) continue;
            result.add(new TransformationInfo(
                catalog,
                schema,
                name,
                "VIEW",
                logic,
                sha256(logic),
                product
            ));
          }
        }
        if (!result.isEmpty() || candidate == candidates.get(candidates.size() - 1)) break;
      } catch (SQLException error) {
        last = error;
      }
    }
    if (result.isEmpty() && last != null) warnings.add("Transformation definitions are not exposed by this JDBC account or engine: " + last.getMessage());
    return result;
  }

  private static List<ViewQuery> viewQueries(String product, Namespace namespace, String table) {
    String lower = product.toLowerCase(Locale.ROOT);
    List<ViewQuery> queries = new ArrayList<>();
    String tableClause = table == null || table.isBlank() ? "" : " AND table_name = ?";
    List<String> informationParams = new ArrayList<>();
    if (namespace.schema() != null) informationParams.add(namespace.schema());
    else if (namespace.catalog() != null) informationParams.add(namespace.catalog());
    if (table != null && !table.isBlank()) informationParams.add(table);

    if (lower.contains("sql server")) {
      String sql = "SELECT DB_NAME() AS table_catalog, SCHEMA_NAME(v.schema_id) AS table_schema, v.name AS table_name, m.definition AS view_definition " +
          "FROM sys.views v JOIN sys.sql_modules m ON m.object_id=v.object_id WHERE SCHEMA_NAME(v.schema_id)=?" + (table == null || table.isBlank() ? "" : " AND v.name=?");
      queries.add(new ViewQuery(sql, params(namespace.schema(), table), "table_catalog", "table_schema", "table_name", "view_definition"));
    } else if (lower.contains("oracle")) {
      String sql = "SELECT NULL AS table_catalog, owner AS table_schema, view_name AS table_name, text AS view_definition FROM all_views WHERE owner=?" +
          (table == null || table.isBlank() ? "" : " AND view_name=?");
      queries.add(new ViewQuery(sql, params(namespace.schema(), table), "table_catalog", "table_schema", "table_name", "view_definition"));
    } else if (lower.contains("postgres") || lower.contains("redshift")) {
      String sql = "SELECT NULL AS table_catalog, schemaname AS table_schema, viewname AS table_name, definition AS view_definition FROM pg_views WHERE schemaname=?" +
          (table == null || table.isBlank() ? "" : " AND viewname=?");
      queries.add(new ViewQuery(sql, params(namespace.schema(), table), "table_catalog", "table_schema", "table_name", "view_definition"));
    }

    String namespaceColumn = "table_schema";
    String genericSql = "SELECT table_catalog, table_schema, table_name, view_definition FROM information_schema.views WHERE " + namespaceColumn + "=?" + tableClause;
    queries.add(new ViewQuery(genericSql, informationParams, "table_catalog", "table_schema", "table_name", "view_definition"));
    return queries;
  }

  private static Map<String, Object> databaseDetails(Connection connection, DatabaseMetaData md, Namespace namespace) throws SQLException {
    Map<String, Object> details = new LinkedHashMap<>();
    details.put("database_product", md.getDatabaseProductName());
    details.put("database_version", md.getDatabaseProductVersion());
    details.put("driver_name", md.getDriverName());
    details.put("driver_version", md.getDriverVersion());
    details.put("jdbc_major_version", md.getJDBCMajorVersion());
    details.put("jdbc_minor_version", md.getJDBCMinorVersion());
    details.put("catalog", namespace.catalog());
    details.put("schema", namespace.schema());
    details.put("read_only", connection.isReadOnly());
    details.put("supports_transactions", md.supportsTransactions());
    details.put("identifier_quote", md.getIdentifierQuoteString());
    return details;
  }

  private static boolean isCatalogDatabase(String product) {
    String value = product == null ? "" : product.toLowerCase(Locale.ROOT);
    return value.contains("mysql") || value.contains("mariadb");
  }

  private static boolean usesCatalogQualifier(String product) {
    String value = product == null ? "" : product.toLowerCase(Locale.ROOT);
    return value.contains("sql server") || value.contains("snowflake") || value.contains("databricks");
  }

  private static String mdProduct(DatabaseMetaData md) {
    try { return md.getDatabaseProductName(); } catch (SQLException ignored) { return "Unknown JDBC"; }
  }

  private static List<String> params(String required, String optional) {
    List<String> values = new ArrayList<>();
    if (required != null) values.add(required);
    if (optional != null && !optional.isBlank()) values.add(optional);
    return values;
  }

  private static String firstNonBlank(String... values) {
    for (String value : values) if (value != null && !value.isBlank()) return value;
    return null;
  }

  private static String safeGet(ResultSet rs, String column) {
    try { return rs.getString(column); } catch (SQLException ignored) { return null; }
  }

  private static Integer safeInt(ResultSet rs, String column) {
    try { int value = rs.getInt(column); return rs.wasNull() ? null : value; } catch (SQLException ignored) { return null; }
  }

  private static String sha256(String value) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (Exception error) { throw new IllegalStateException("Unable to hash transformation logic", error); }
  }

  private static int environmentInt(String name, int fallback, int min, int max) {
    try {
      int parsed = Integer.parseInt(Optional.ofNullable(System.getenv(name)).orElse(""));
      return Math.max(min, Math.min(max, parsed));
    } catch (Exception ignored) { return fallback; }
  }

  private static void validateOptionalIdentifier(String value, String field) {
    if (value != null && !value.isBlank()) validateIdentifier(value, field);
  }

  private static void validateIdentifier(String value, String field) {
    if (value == null || !value.matches("[A-Za-z_][A-Za-z0-9_$#@-]*")) throw new IllegalArgumentException(field + " contains invalid identifier characters.");
  }

  private static void validateJdbcUrl(String url) {
    if (url == null || !url.startsWith("jdbc:")) throw new IllegalArgumentException("jdbcUrl must be a JDBC URL.");
    if (url.matches("(?i).*jdbc:[^:]+://[^/\\s:@]+:[^/\\s@]+@.*") || url.matches("(?i).*jdbc:[^:]+://[^/\\s@]+@.*")) {
      throw new IllegalArgumentException("jdbcUrl must not contain embedded credentials.");
    }
  }

  public record CredentialRequest(@NotBlank @Pattern(regexp="[A-Za-z0-9._-]{1,200}") String credentialRef, @NotBlank String username, @NotBlank String password) {}
  public record CredentialResponse(boolean saved, String credentialRef) {}
  public record JdbcCatalogRequest(@NotBlank String jdbcUrl, @NotBlank String credentialRef, @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String schema, @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String catalog) {}
  public record JdbcRequest(@NotBlank String jdbcUrl, @NotBlank String credentialRef, @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String schema, @NotBlank @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String table, @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String catalog) {}
  public record JdbcQueryRequest(@NotBlank String jdbcUrl, @NotBlank String credentialRef, @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String schema, @NotBlank @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String table, Integer limit, @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String catalog) {}
  public record JdbcLineageRequest(@NotBlank String jdbcUrl, @NotBlank String credentialRef, @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String schema, @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String table, @Pattern(regexp="[A-Za-z_][A-Za-z0-9_$#@-]*") String catalog) {}
  public record Namespace(String catalog, String schema, String product) {}
  public record ColumnInfo(String name, String type, Integer size, Integer scale, Boolean nullable, String defaultValue) {}
  public record TableInfo(String name, String type, String catalog, String schema, String remarks) {}
  public record TransformationInfo(String catalog, String schema, String name, String operation, String transformationLogic, String logicHash, String engine) {}
  public record CatalogResponse(List<String> schemas, List<TableInfo> tables, Map<String,Object> details) {}
  public record ValidateResponse(boolean valid, List<ColumnInfo> columns, Long rowCount, Map<String,Object> details, List<String> warnings) {}
  public record QueryResponse(List<Map<String,Object>> rows, Long rowCount, List<ColumnInfo> columns, List<String> warnings) {}
  public record LineageResponse(String databaseProduct, String databaseVersion, String catalog, String schema, List<TransformationInfo> transformations, List<String> warnings) {}
  private record ViewQuery(String sql, List<String> params, String catalogColumn, String schemaColumn, String nameColumn, String logicColumn) {}

  @ResponseStatus(HttpStatus.BAD_REQUEST)
  @ExceptionHandler({IllegalArgumentException.class})
  Map<String,String> badRequest(Exception e) { return Map.of("error", e.getMessage() == null ? "Invalid request" : e.getMessage()); }
}
