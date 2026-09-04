package com.datanexus.jdbcbridge;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.sql.DriverManager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class JdbcBridgeControllerTest {
  private MockMvc mvc;
  private CredentialStore credentials;
  private static final String JDBC_URL = "jdbc:h2:mem:bridge-test;DB_CLOSE_DELAY=-1";

  @BeforeEach
  void setUp() throws Exception {
    credentials = Mockito.mock(CredentialStore.class);
    Mockito.when(credentials.resolve("test-ref")).thenReturn(new Credentials("sa", ""));
    try (var connection = DriverManager.getConnection(JDBC_URL, "sa", "")) {
      try (var statement = connection.createStatement()) {
        statement.execute("DROP VIEW IF EXISTS active_customers");
        statement.execute("CREATE TABLE IF NOT EXISTS customers (id INT PRIMARY KEY, name VARCHAR(100))");
        statement.execute("DELETE FROM customers");
        try (var insert = connection.prepareStatement("INSERT INTO customers VALUES (?, ?)") ) {
          for (int i = 1; i <= 10001; i++) {
            insert.setInt(1, i);
            insert.setString(2, "customer-" + i);
            insert.addBatch();
          }
          insert.executeBatch();
        }
        statement.execute("CREATE VIEW active_customers AS SELECT id, name FROM customers WHERE id > 10");
      }
    }
    mvc = MockMvcBuilders.standaloneSetup(new JdbcBridgeController(credentials))
        .setControllerAdvice(new JdbcUrlCredentialGuard())
        .build();
  }

  @AfterEach
  void tearDown() throws Exception {
    try (var connection = DriverManager.getConnection(JDBC_URL, "sa", "")) {
      connection.createStatement().execute("DROP VIEW IF EXISTS active_customers");
      connection.createStatement().execute("DROP TABLE IF EXISTS customers");
    }
  }

  @Test
  void rejectsNonJdbcUrl() throws Exception {
    mvc.perform(post("/v1/validate")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"postgresql://host/db\",\"credentialRef\":\"test-ref\",\"schema\":\"PUBLIC\",\"table\":\"customers\"}"))
        .andExpect(status().isBadRequest());
    Mockito.verifyNoInteractions(credentials);
  }

  @Test
  void rejectsEmbeddedJdbcCredentials() throws Exception {
    mvc.perform(post("/v1/validate")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"jdbc:postgresql://user:password@host/db\",\"credentialRef\":\"test-ref\",\"schema\":\"PUBLIC\",\"table\":\"customers\"}"))
        .andExpect(status().isBadRequest());
    Mockito.verifyNoInteractions(credentials);
  }

  @Test
  void rejectsSqlServerCredentialProperties() throws Exception {
    mvc.perform(post("/v1/validate")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"jdbc:sqlserver://host:1433;databaseName=db;user=sa;password=secret\",\"credentialRef\":\"test-ref\",\"schema\":\"dbo\",\"table\":\"customers\"}"))
        .andExpect(status().isBadRequest());
    Mockito.verifyNoInteractions(credentials);
  }

  @Test
  void rejectsQueryStringCredentialProperties() throws Exception {
    mvc.perform(post("/v1/validate")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"jdbc:postgresql://host/db?user=app&password=secret\",\"credentialRef\":\"test-ref\",\"schema\":\"PUBLIC\",\"table\":\"customers\"}"))
        .andExpect(status().isBadRequest());
    Mockito.verifyNoInteractions(credentials);
  }

  @Test
  void rejectsOracleThinCredentials() throws Exception {
    mvc.perform(post("/v1/validate")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"jdbc:oracle:thin:scott/tiger@//host:1521/service\",\"credentialRef\":\"test-ref\",\"schema\":\"SCOTT\",\"table\":\"customers\"}"))
        .andExpect(status().isBadRequest());
    Mockito.verifyNoInteractions(credentials);
  }

  @Test
  void rejectsUnsafeIdentifiers() throws Exception {
    mvc.perform(post("/v1/query")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"" + JDBC_URL + "\",\"credentialRef\":\"test-ref\",\"schema\":\"PUBLIC;DROP TABLE customers\",\"table\":\"customers\",\"limit\":1}"))
        .andExpect(status().isBadRequest());
    Mockito.verifyNoInteractions(credentials);
  }

  @Test
  void discoversSchemasTablesAndViewsWithoutReturningSystemSchemas() throws Exception {
    String body = mvc.perform(post("/v1/catalog")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"" + JDBC_URL + "\",\"credentialRef\":\"test-ref\",\"schema\":\"PUBLIC\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
    assertTrue(json.path("tables").size() >= 2);
    assertTrue(json.path("details").path("database_product").asText().length() > 0);
    for (var schema : json.path("schemas")) assertEquals(false, schema.asText().toLowerCase().startsWith("pg_"));
  }

  @Test
  void honorsRequestedSamplingRowsWithoutBusinessQuota() throws Exception {
    String body = mvc.perform(post("/v1/query")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"" + JDBC_URL + "\",\"credentialRef\":\"test-ref\",\"schema\":\"PUBLIC\",\"table\":\"CUSTOMERS\",\"limit\":20000}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
    assertEquals(10001, json.path("rows").size());
    assertEquals(2, json.path("columns").size());
  }

  @Test
  void extractsViewTransformationLogicForLineage() throws Exception {
    String body = mvc.perform(post("/v1/lineage")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"" + JDBC_URL + "\",\"credentialRef\":\"test-ref\",\"schema\":\"PUBLIC\",\"table\":\"ACTIVE_CUSTOMERS\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
    assertEquals(1, json.path("transformations").size());
    assertEquals("VIEW", json.path("transformations").get(0).path("operation").asText());
    assertTrue(json.path("transformations").get(0).path("transformationLogic").asText().toLowerCase().contains("select"));
    assertEquals(64, json.path("transformations").get(0).path("logicHash").asText().length());
  }
}