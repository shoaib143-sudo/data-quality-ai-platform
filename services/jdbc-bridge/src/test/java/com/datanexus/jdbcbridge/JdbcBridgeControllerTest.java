package com.datanexus.jdbcbridge;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.sql.DriverManager;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
      }
    }
    mvc = MockMvcBuilders.standaloneSetup(new JdbcBridgeController(credentials)).build();
  }

  @AfterEach
  void tearDown() throws Exception {
    try (var connection = DriverManager.getConnection(JDBC_URL, "sa", "")) {
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
  void rejectsUnsafeIdentifiers() throws Exception {
    mvc.perform(post("/v1/query")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"" + JDBC_URL + "\",\"credentialRef\":\"test-ref\",\"schema\":\"PUBLIC;DROP TABLE customers\",\"table\":\"customers\",\"limit\":1}"))
        .andExpect(status().isBadRequest());
    Mockito.verifyNoInteractions(credentials);
  }

  @Test
  void discoversSchemasAndTablesWithoutReturningSystemSchemas() throws Exception {
    String body = mvc.perform(post("/v1/catalog")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"" + JDBC_URL + "\",\"credentialRef\":\"test-ref\",\"schema\":\"PUBLIC\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
    assertEquals(1, json.path("tables").size());
    assertEquals("CUSTOMERS", json.path("tables").get(0).path("name").asText());
    for (var schema : json.path("schemas")) assertEquals(false, schema.asText().toLowerCase().startsWith("pg_"));
  }

  @Test
  void capsQueryAtTenThousandRows() throws Exception {
    String body = mvc.perform(post("/v1/query")
        .contentType("application/json")
        .content("{\"jdbcUrl\":\"" + JDBC_URL + "\",\"credentialRef\":\"test-ref\",\"schema\":\"PUBLIC\",\"table\":\"CUSTOMERS\",\"limit\":20000}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(body);
    assertEquals(10000, json.path("rows").size());
    assertEquals(2, json.path("columns").size());
  }
}
