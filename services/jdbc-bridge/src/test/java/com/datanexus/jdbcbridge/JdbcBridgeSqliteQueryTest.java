package com.datanexus.jdbcbridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class JdbcBridgeSqliteQueryTest {
  @Test
  void loadsSchemalessSqliteRowsThroughQueryEndpoint() throws Exception {
    Path database = Files.createTempFile("datanexus-sqlite-query-", ".db");
    String jdbcUrl = "jdbc:sqlite:" + database.toAbsolutePath();

    try {
      try (var connection = DriverManager.getConnection(jdbcUrl)) {
        try (var statement = connection.createStatement()) {
          statement.execute("CREATE TABLE Album (AlbumId INTEGER PRIMARY KEY, Title TEXT NOT NULL, ArtistId INTEGER NOT NULL)");
        }
        try (var insert = connection.prepareStatement("INSERT INTO Album (AlbumId, Title, ArtistId) VALUES (?, ?, ?)")) {
          for (int i = 1; i <= 347; i++) {
            insert.setInt(1, i);
            insert.setString(2, "Album " + i);
            insert.setInt(3, ((i - 1) % 50) + 1);
            insert.addBatch();
          }
          insert.executeBatch();
        }
      }

      CredentialStore credentials = Mockito.mock(CredentialStore.class);
      Mockito.when(credentials.resolve("sqlite-test-ref")).thenReturn(new Credentials("", ""));
      MockMvc mvc = MockMvcBuilders.standaloneSetup(new JdbcBridgeController(credentials))
          .setControllerAdvice(new JdbcUrlCredentialGuard())
          .build();

      String body = mvc.perform(post("/v1/query")
              .contentType("application/json")
              .content("{\"jdbcUrl\":\"" + jdbcUrl.replace("\\", "\\\\") + "\",\"credentialRef\":\"sqlite-test-ref\",\"table\":\"Album\",\"limit\":1000}"))
          .andExpect(status().isOk())
          .andReturn().getResponse().getContentAsString();

      var json = new ObjectMapper().readTree(body);
      assertEquals(347, json.path("rows").size());
      assertEquals(3, json.path("columns").size());
      assertEquals(1, json.path("rows").get(0).path("AlbumId").asInt());
      assertEquals("Album 1", json.path("rows").get(0).path("Title").asText());
    } finally {
      Files.deleteIfExists(database);
    }
  }
}
