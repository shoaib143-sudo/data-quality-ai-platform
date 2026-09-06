package com.datanexus.jdbcbridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class CredentialStoreTest {
  private HttpServer server;

  @AfterEach
  void tearDown() {
    if (server != null) server.stop(0);
  }

  @Test
  void resolvesSingleCredentialFromEnvironmentModeWithoutInfisical() throws Exception {
    InfisicalAuthClient auth = new InfisicalAuthClient(new ObjectMapper(), "http://unused.invalid", "", "", HttpClient.newHttpClient());
    CredentialStore store = new CredentialStore(
        new ObjectMapper(), auth, "http://unused.invalid", "", "dev", "/",
        "environment", "customer-postgres", "readonly-user", "test-password", HttpClient.newHttpClient());

    Credentials credentials = store.resolve("customer-postgres");

    assertEquals("readonly-user", credentials.username());
    assertEquals("test-password", credentials.password());
  }

  @Test
  void rejectsUnknownCredentialReferenceInEnvironmentMode() throws Exception {
    InfisicalAuthClient auth = new InfisicalAuthClient(new ObjectMapper(), "http://unused.invalid", "", "", HttpClient.newHttpClient());
    CredentialStore store = new CredentialStore(
        new ObjectMapper(), auth, "http://unused.invalid", "", "dev", "/",
        "environment", "customer-postgres", "readonly-user", "test-password", HttpClient.newHttpClient());

    IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> store.resolve("other-source"));
    assertTrue(error.getMessage().contains("Unknown credentialRef"));
  }

  @Test
  void rejectsIncompleteEnvironmentCredentialConfiguration() throws Exception {
    InfisicalAuthClient auth = new InfisicalAuthClient(new ObjectMapper(), "http://unused.invalid", "", "", HttpClient.newHttpClient());
    CredentialStore store = new CredentialStore(
        new ObjectMapper(), auth, "http://unused.invalid", "", "dev", "/",
        "environment", "customer-postgres", "readonly-user", "", HttpClient.newHttpClient());

    IllegalStateException error = assertThrows(IllegalStateException.class, () -> store.resolve("customer-postgres"));
    assertTrue(error.getMessage().contains("JDBC_CREDENTIAL_PASSWORD"));
  }

  @Test
  void disablesCredentialWritesInEnvironmentMode() throws Exception {
    InfisicalAuthClient auth = new InfisicalAuthClient(new ObjectMapper(), "http://unused.invalid", "", "", HttpClient.newHttpClient());
    CredentialStore store = new CredentialStore(
        new ObjectMapper(), auth, "http://unused.invalid", "", "dev", "/",
        "environment", "customer-postgres", "readonly-user", "test-password", HttpClient.newHttpClient());

    IllegalStateException error = assertThrows(
        IllegalStateException.class,
        () -> store.upsert("customer-postgres", "new-user", "new-password"));
    assertTrue(error.getMessage().contains("Credential writes are disabled"));
  }

  @Test
  void retriesWithFreshTokenAfterInfisical401() throws Exception {
    AtomicInteger loginCount = new AtomicInteger();
    AtomicInteger secretCount = new AtomicInteger();
    server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
    server.createContext("/api/v1/auth/universal-auth/login", exchange -> {
      int login = loginCount.incrementAndGet();
      respond(exchange, 200, "{\"accessToken\":\"token-" + login + "\",\"expiresIn\":3600}");
    });
    server.createContext("/api/v4/secrets/customer-postgres", exchange -> {
      int call = secretCount.incrementAndGet();
      if (call == 1) respond(exchange, 401, "{\"message\":\"expired\"}");
      else respond(exchange, 200, "{\"secret\":{\"secretValue\":\"{\\\"username\\\":\\\"db-user\\\",\\\"password\\\":\\\"db-password\\\"}\"}}");
    });
    server.start();

    InfisicalAuthClient auth = new InfisicalAuthClient(new ObjectMapper(), baseUrl(), "client-id", "client-secret", HttpClient.newHttpClient());
    CredentialStore store = new CredentialStore(new ObjectMapper(), auth, baseUrl(), "project", "dev", "/", HttpClient.newHttpClient());

    Credentials credentials = store.resolve("customer-postgres");

    assertEquals("db-user", credentials.username());
    assertEquals("db-password", credentials.password());
    assertEquals(2, loginCount.get());
    assertEquals(2, secretCount.get());
  }

  @Test
  void rejectsInvalidCredentialReferenceBeforeNetworkCall() throws Exception {
    AtomicInteger requests = new AtomicInteger();
    server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
    server.createContext("/", exchange -> {
      requests.incrementAndGet();
      respond(exchange, 500, "{}");
    });
    server.start();

    InfisicalAuthClient auth = new InfisicalAuthClient(new ObjectMapper(), baseUrl(), "client-id", "client-secret", HttpClient.newHttpClient());
    CredentialStore store = new CredentialStore(new ObjectMapper(), auth, baseUrl(), "project", "dev", "/", HttpClient.newHttpClient());

    IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> store.resolve("../password"));
    assertTrue(error.getMessage().contains("invalid characters"));
    assertEquals(0, requests.get());
  }

  @Test
  void rejectsMissingProjectConfiguration() throws Exception {
    server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
    server.start();
    InfisicalAuthClient auth = new InfisicalAuthClient(new ObjectMapper(), baseUrl(), "client-id", "client-secret", HttpClient.newHttpClient());
    CredentialStore store = new CredentialStore(new ObjectMapper(), auth, baseUrl(), "", "dev", "/", HttpClient.newHttpClient());

    IllegalStateException error = assertThrows(IllegalStateException.class, () -> store.resolve("customer-postgres"));
    assertTrue(error.getMessage().contains("INFISICAL_PROJECT_ID"));
  }

  private String baseUrl() {
    return "http://localhost:" + server.getAddress().getPort();
  }

  private static void respond(HttpExchange exchange, int status, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().add("Content-Type", "application/json");
    exchange.sendResponseHeaders(status, bytes.length);
    try (var output = exchange.getResponseBody()) {
      output.write(bytes);
    }
  }
}
