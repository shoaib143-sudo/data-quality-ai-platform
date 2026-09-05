package com.datanexus.jdbcbridge;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@RestController
public class JdbcHierarchyController {
  private static final int MAX_NODES = environmentInt("JDBC_BRIDGE_HIERARCHY_MAX_NODES", 50_000, 1_000, 250_000);
  private final CredentialStore credentials;

  public JdbcHierarchyController(CredentialStore credentials) {
    this.credentials = credentials;
  }

  @PostMapping("/v1/hierarchy")
  public HierarchyResponse hierarchy(@Valid @RequestBody HierarchyRequest request) throws Exception {
    validateJdbcUrl(request.jdbcUrl());
    Credentials c = credentials.resolve(request.credentialRef());
    try (Connection connection = DriverManager.getConnection(request.jdbcUrl(), c.username(), c.password())) {
      connection.setReadOnly(true);
      DatabaseMetaData md = connection.getMetaData();
      HierarchyBuilder builder = new HierarchyBuilder(md, MAX_NODES);
      String product = nonBlank(md.getDatabaseProductName(), "Generic JDBC");
      String version = blankToNull(md.getDatabaseProductVersion());
      String catalogTerm = blankToNull(md.getCatalogTerm());
      String schemaTerm = blankToNull(md.getSchemaTerm());
      String rootLabel = nativeRootLabel(product);
      String rootName = firstNonBlank(connection.getCatalog(), connection.getSchema(), product);
      String rootQualified = nonBlank(rootName, product);
      String rootId = builder.add(null, "ROOT", rootLabel, rootQualified, rootQualified, false, true, null, null, null, null, null, null, false, Map.of("database_product", product));

      List<String> catalogs = readCatalogs(md);
      String currentCatalog = blankToNull(connection.getCatalog());
      if (catalogs.isEmpty() && currentCatalog != null) catalogs = List.of(currentCatalog);

      if (!catalogs.isEmpty()) {
        for (String catalog : catalogs) {
          if (builder.full()) break;
          String catalogId = builder.add(rootId, "CATALOG", catalogTerm == null ? "CATALOG" : catalogTerm, catalog, catalog, true, true, catalog, null, null, null, null, null, systemName(catalog), Map.of());
          List<String> schemas = readSchemas(md, catalog);
          if (schemas.isEmpty() || schemaTerm == null) {
            readObjects(builder, md, catalogId, catalog, null, catalog);
          } else {
            for (String schema : schemas) {
              if (builder.full()) break;
              String qualified = catalog + "." + schema;
              String schemaId = builder.add(catalogId, "SCHEMA", schemaTerm, schema, qualified, true, true, catalog, schema, null, null, null, null, systemName(schema), Map.of());
              readObjects(builder, md, schemaId, catalog, schema, qualified);
            }
          }
        }
      } else {
        List<String> schemas = readSchemas(md, null);
        if (!schemas.isEmpty()) {
          for (String schema : schemas) {
            if (builder.full()) break;
            String schemaId = builder.add(rootId, "SCHEMA", schemaTerm == null ? "SCHEMA" : schemaTerm, schema, schema, true, true, null, schema, null, null, null, null, systemName(schema), Map.of());
            readObjects(builder, md, schemaId, null, schema, schema);
          }
        } else {
          readObjects(builder, md, rootId, null, null, rootQualified);
        }
      }

      Map<String, String> terms = new LinkedHashMap<>();
      terms.put("root", rootLabel);
      terms.put("catalog", catalogTerm);
      terms.put("schema", schemaTerm);
      terms.put("object", "object");
      terms.put("field", "column");

      Map<String, Object> details = new LinkedHashMap<>();
      details.put("driver_name", md.getDriverName());
      details.put("driver_version", md.getDriverVersion());
      details.put("jdbc_major_version", md.getJDBCMajorVersion());
      details.put("jdbc_minor_version", md.getJDBCMinorVersion());
      details.put("catalog_separator", blankToNull(md.getCatalogSeparator()));
      details.put("catalog_at_start", md.isCatalogAtStart());
      details.put("supports_catalogs_in_table_definitions", md.supportsCatalogsInTableDefinitions());
      details.put("supports_schemas_in_table_definitions", md.supportsSchemasInTableDefinitions());
      details.put("max_nodes", MAX_NODES);

      List<String> warnings = new ArrayList<>(builder.warnings());
      if (builder.full()) warnings.add("Native hierarchy reached the connector safety ceiling of " + MAX_NODES + " nodes. Narrow the source permissions or connection scope to inspect additional objects.");
      return new HierarchyResponse(product, version, terms, builder.nodes(), List.of(rootId), warnings, builder.full(), details);
    }
  }

  private static void readObjects(HierarchyBuilder builder, DatabaseMetaData md, String parentId, String catalog, String schema, String parentQualified) {
    try (ResultSet rs = md.getTables(catalog, schema, "%", null)) {
      while (rs.next() && !builder.full()) {
        String name = safeGet(rs, "TABLE_NAME");
        if (name == null || name.isBlank()) continue;
        String resolvedCatalog = firstNonBlank(safeGet(rs, "TABLE_CAT"), catalog);
        String resolvedSchema = firstNonBlank(safeGet(rs, "TABLE_SCHEM"), schema);
        String nativeType = nonBlank(safeGet(rs, "TABLE_TYPE"), "OBJECT");
        String qualified = join(resolvedCatalog, resolvedSchema, name);
        if (qualified.isBlank()) qualified = parentQualified + "." + name;
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("remarks", blankToNull(safeGet(rs, "REMARKS")));
        metadata.put("type_catalog", blankToNull(safeGet(rs, "TYPE_CAT")));
        metadata.put("type_schema", blankToNull(safeGet(rs, "TYPE_SCHEM")));
        metadata.put("type_name", blankToNull(safeGet(rs, "TYPE_NAME")));
        String objectId = builder.add(parentId, "OBJECT", nativeType, name, qualified, true, true, resolvedCatalog, resolvedSchema, name, nativeType, null, null, systemName(name) || systemName(resolvedSchema), metadata);
        readColumns(builder, md, objectId, resolvedCatalog, resolvedSchema, name, qualified);
      }
    } catch (SQLException error) {
      builder.warn("Unable to enumerate objects under " + parentQualified + ": " + safeMessage(error));
    }
  }

  private static void readColumns(HierarchyBuilder builder, DatabaseMetaData md, String parentId, String catalog, String schema, String table, String parentQualified) {
    try (ResultSet rs = md.getColumns(catalog, schema, table, "%")) {
      while (rs.next() && !builder.full()) {
        String name = safeGet(rs, "COLUMN_NAME");
        if (name == null || name.isBlank()) continue;
        String dataType = firstNonBlank(safeGet(rs, "TYPE_NAME"), safeGet(rs, "DATA_TYPE"));
        Integer ordinal = safeInt(rs, "ORDINAL_POSITION");
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("nullable", blankToNull(safeGet(rs, "IS_NULLABLE")));
        metadata.put("default_value", blankToNull(safeGet(rs, "COLUMN_DEF")));
        metadata.put("column_size", safeInt(rs, "COLUMN_SIZE"));
        metadata.put("decimal_digits", safeInt(rs, "DECIMAL_DIGITS"));
        builder.add(parentId, "FIELD", "COLUMN", name, parentQualified + "." + name, true, false, catalog, schema, table, null, dataType, ordinal, false, metadata);
      }
    } catch (SQLException error) {
      builder.warn("Unable to enumerate fields for " + parentQualified + ": " + safeMessage(error));
    }
  }

  private static List<String> readCatalogs(DatabaseMetaData md) {
    Set<String> result = new LinkedHashSet<>();
    try (ResultSet rs = md.getCatalogs()) {
      while (rs.next()) {
        String value = safeGet(rs, "TABLE_CAT");
        if (value != null && !value.isBlank()) result.add(value);
      }
    } catch (SQLException ignored) {}
    return new ArrayList<>(result);
  }

  private static List<String> readSchemas(DatabaseMetaData md, String catalog) {
    Set<String> result = new LinkedHashSet<>();
    try (ResultSet rs = md.getSchemas(catalog, "%")) {
      while (rs.next()) {
        String value = safeGet(rs, "TABLE_SCHEM");
        String rowCatalog = safeGet(rs, "TABLE_CATALOG");
        if (value != null && !value.isBlank() && (catalog == null || rowCatalog == null || rowCatalog.isBlank() || catalog.equalsIgnoreCase(rowCatalog))) result.add(value);
      }
      return new ArrayList<>(result);
    } catch (SQLException ignored) {}
    try (ResultSet rs = md.getSchemas()) {
      while (rs.next()) {
        String value = safeGet(rs, "TABLE_SCHEM");
        String rowCatalog = safeGet(rs, "TABLE_CATALOG");
        if (value != null && !value.isBlank() && (catalog == null || rowCatalog == null || rowCatalog.isBlank() || catalog.equalsIgnoreCase(rowCatalog))) result.add(value);
      }
    } catch (SQLException ignored) {}
    return new ArrayList<>(result);
  }

  private static String nativeRootLabel(String product) {
    String value = product == null ? "" : product.toLowerCase(Locale.ROOT);
    if (value.contains("sql server")) return "server";
    if (value.contains("snowflake")) return "account";
    if (value.contains("databricks")) return "metastore";
    if (value.contains("redshift")) return "cluster/workgroup";
    if (value.contains("oracle")) return "database";
    if (value.contains("postgres")) return "database";
    if (value.contains("mysql") || value.contains("mariadb")) return "server";
    return "connection";
  }

  private static boolean systemName(String value) {
    if (value == null) return false;
    String normalized = value.toLowerCase(Locale.ROOT);
    return normalized.equals("information_schema") || normalized.equals("pg_catalog") || normalized.equals("mysql") || normalized.equals("performance_schema") || normalized.equals("sys") || normalized.startsWith("pg_toast") || normalized.equals("system");
  }

  private static String nodeId(String kind, String qualifiedName) {
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest((kind + "\n" + qualifiedName).getBytes(StandardCharsets.UTF_8));
      return kind.toLowerCase(Locale.ROOT) + ":" + HexFormat.of().formatHex(digest).substring(0, 24);
    } catch (Exception error) {
      throw new IllegalStateException("Unable to create hierarchy identity.", error);
    }
  }

  private static String join(String... values) {
    List<String> parts = new ArrayList<>();
    for (String value : values) if (value != null && !value.isBlank()) parts.add(value);
    return String.join(".", parts);
  }

  private static String safeGet(ResultSet rs, String column) {
    try { return rs.getString(column); } catch (SQLException ignored) { return null; }
  }

  private static Integer safeInt(ResultSet rs, String column) {
    try { int value = rs.getInt(column); return rs.wasNull() ? null : value; } catch (SQLException ignored) { return null; }
  }

  private static String firstNonBlank(String... values) {
    for (String value : values) if (value != null && !value.isBlank()) return value;
    return null;
  }

  private static String nonBlank(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }

  private static String safeMessage(Exception error) {
    return error.getMessage() == null || error.getMessage().isBlank() ? error.getClass().getSimpleName() : error.getMessage();
  }

  private static int environmentInt(String name, int fallback, int min, int max) {
    try {
      int parsed = Integer.parseInt(Optional.ofNullable(System.getenv(name)).orElse(""));
      return Math.max(min, Math.min(max, parsed));
    } catch (Exception ignored) { return fallback; }
  }

  private static void validateJdbcUrl(String url) {
    if (url == null || !url.startsWith("jdbc:")) throw new IllegalArgumentException("jdbcUrl must be a JDBC URL.");
    if (url.matches("(?i).*jdbc:[^:]+://[^/\\s:@]+:[^/\\s@]+@.*") || url.matches("(?i).*jdbc:[^:]+://[^/\\s@]+@.*")) throw new IllegalArgumentException("jdbcUrl must not contain embedded credentials.");
  }

  private static final class HierarchyBuilder {
    private final DatabaseMetaData metadata;
    private final int maxNodes;
    private final List<HierarchyNode> nodes = new ArrayList<>();
    private final List<String> warnings = new ArrayList<>();

    private HierarchyBuilder(DatabaseMetaData metadata, int maxNodes) {
      this.metadata = metadata;
      this.maxNodes = maxNodes;
    }

    private String add(String parentId, String kind, String nativeType, String name, String qualifiedName, boolean selectable, boolean hasChildren, String catalog, String schema, String object, String objectType, String dataType, Integer ordinal, boolean system, Map<String, Object> nodeMetadata) {
      if (full()) return "";
      String id = nodeId(kind, qualifiedName);
      nodes.add(new HierarchyNode(id, parentId, kind, nativeType, name, qualifiedName, selectable, hasChildren, catalog, schema, object, objectType, dataType, ordinal, system, nodeMetadata));
      return id;
    }

    private boolean full() { return nodes.size() >= maxNodes; }
    private void warn(String warning) { if (warnings.size() < 100) warnings.add(warning); }
    private List<HierarchyNode> nodes() { return nodes; }
    private List<String> warnings() { return warnings; }
  }

  public record HierarchyRequest(@NotBlank String jdbcUrl, @NotBlank String credentialRef) {}
  public record HierarchyNode(String id, String parentId, String kind, String nativeType, String name, String qualifiedName, boolean selectable, boolean hasChildren, String catalog, String schema, String object, String objectType, String dataType, Integer ordinal, boolean system, Map<String, Object> metadata) {}
  public record HierarchyResponse(String databaseProduct, String databaseVersion, Map<String, String> terms, List<HierarchyNode> nodes, List<String> rootIds, List<String> warnings, boolean truncated, Map<String, Object> details) {}
}
