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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class InfisicalAuthClientTest {
  private HttpServer server;

  @AfterEach
  void tearDown() {
    if (server != null) server.stop(0);
  }

  @Test
  void exchangesUniversalAuthCredentialsAndCachesToken() throws Exception {
    AtomicInteger logins = new AtomicInteger();
    server = server(exchange -> {
      logins.incrementAndGet();
      respond(exchange, 200, "{\"accessToken\":\"token-one\",\"expiresIn\":3600}");
    }, "/api/v1/auth/universal-auth/login");
    InfisicalAuthClient client = client();
    assertEquals("token-one", client.getAccessToken());
    assertEquals("token-one", client.getAccessToken());
    assertEquals(1, logins.get());
  }

  @Test
  void refreshesAfterExpiry() throws Exception {
    AtomicInteger logins = new AtomicInteger();
    server = server(exchange -> {
      int call = logins.incrementAndGet();
      respond(exchange, 200, "{\"accessToken\":\"token-" + call + "\",\"expiresIn\":1}");
    }, "/api/v1/auth/universal-auth/login");
    InfisicalAuthClient client = client();
    assertEquals("token-1", client.getAccessToken());
    assertEquals("token-2", client.getAccessToken());
    assertEquals(2, logins.get());
  }

  @Test
  void explicitInvalidationForcesFreshLogin() throws Exception {
    AtomicInteger logins = new AtomicInteger();
    server = server(exchange -> {
      int call = logins.incrementAndGet();
      respond(exchange, 200, "{\"accessToken\":\"token-" + call + "\",\"expiresIn\":3600}");
    }, "/api/v1/auth/universal-auth/login");
    InfisicalAuthClient client = client();
    assertEquals("token-1", client.getAccessToken());
    client.invalidate();
    assertEquals("token-2", client.getAccessToken());
    assertEquals(2, logins.get());
  }

  @Test
  void staleRejectionCannotInvalidateNewerConcurrentToken() throws Exception {
    server = server(exchange -> respond(exchange, 200, "{\"accessToken\":\"token-one\",\"expiresIn\":3600}"), "/api/v1/auth/universal-auth/login");
    InfisicalAuthClient client = client();
    assertEquals("token-one", client.getAccessToken());
    client.invalidate();
    server.removeContext("/api/v1/auth/universal-auth/login");
    server.createContext("/api/v1/auth/universal-auth/login", exchange -> respond(exchange, 200, "{\"accessToken\":\"token-two\",\"expiresIn\":3600}"));
    assertEquals("token-two", client.getAccessToken());
    client.invalidateIfCurrent("token-one");
    assertEquals("token-two", client.getAccessToken());
  }

  @Test
  void concurrentRefreshPerformsSingleLogin() throws Exception {
    AtomicInteger logins = new AtomicInteger();
    server = server(exchange -> {
      logins.incrementAndGet();
      respond(exchange, 200, "{\"accessToken\":\"token\",\"expiresIn\":3600}");
    }, "/api/v1/auth/universal-auth/login");
    InfisicalAuthClient client = client();
    client.invalidate();
    CountDownLatch ready = new CountDownLatch(8);
    CountDownLatch start = new CountDownLatch(1);
    var executor = Executors.newFixedThreadPool(8);
    try {
      var futures = java.util.stream.IntStream.range(0, 8).mapToObj(i -> executor.submit(() -> {
        ready.countDown();
        start.await();
        return client.getAccessToken();
      })).toList();
      assertTrue(ready.await(5, java.util.concurrent.TimeUnit.SECONDS));
      start.countDown();
      for (var future : futures) assertEquals("token", future.get());
      assertEquals(1, logins.get());
    } finally {
      executor.shutdownNow();
    }
  }

  @Test
  void rejectsMissingUniversalAuthConfiguration() throws Exception {
    server = server(exchange -> respond(exchange, 200, "{}"), "/api/v1/auth/universal-auth/login");
    InfisicalAuthClient client = new InfisicalAuthClient(new ObjectMapper(), serverUrl(), "", "", HttpClient.newHttpClient());
    IllegalStateException error = assertThrows(IllegalStateException.class, client::getAccessToken);
    assertTrue(error.getMessage().contains("INFISICAL_CLIENT_ID"));
  }

  private InfisicalAuthClient client() {
    return new InfisicalAuthClient(new ObjectMapper(), serverUrl(), "client-id", "client-secret", HttpClient.newHttpClient());
  }

  private String serverUrl() {
    return "http://localhost:" + server.getAddress().getPort();
  }

  private HttpServer server(HttpHandler handler, String path) throws IOException {
    HttpServer value = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
    value.createContext(path, handler::handle);
    value.start();
    return value;
  }

  @FunctionalInterface
  private interface HttpHandler {
    void handle(HttpExchange exchange) throws IOException;
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
