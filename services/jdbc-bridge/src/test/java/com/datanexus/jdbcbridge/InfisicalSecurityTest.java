package com.datanexus.jdbcbridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class InfisicalSecurityTest {
  private HttpServer server;

  @AfterEach
  void tearDown() {
    if (server != null) server.stop(0);
  }

  @Test
  void authenticationFailureDoesNotEchoResponseBodyOrSecret() throws Exception {
    String sensitiveBody = "database-password=should-never-appear";
    server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
    server.createContext("/api/v1/auth/universal-auth/login", exchange -> {
      byte[] bytes = sensitiveBody.getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(500, bytes.length);
      try (var output = exchange.getResponseBody()) {
        output.write(bytes);
      }
    });
    server.start();

    InfisicalAuthClient client = new InfisicalAuthClient(
        new ObjectMapper(), "http://localhost:" + server.getAddress().getPort(), "client-id", "client-secret", HttpClient.newHttpClient());

    Exception error = assertThrows(Exception.class, client::getAccessToken);
    assertFalse(error.getMessage().contains(sensitiveBody));
    assertFalse(error.getMessage().contains("client-secret"));
  }
}
