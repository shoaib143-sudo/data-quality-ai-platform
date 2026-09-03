package com.datanexus.jdbcbridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class CredentialStore {
  private final ObjectMapper mapper;
  private final HttpClient http;
  private final InfisicalAuthClient authClient;
  private final String apiUrl;
  private final String projectId;
  private final String environment;
  private final String secretPath;
  private final Map<String, CachedCredential> cache = new ConcurrentHashMap<>();

  public CredentialStore(
      ObjectMapper mapper,
      InfisicalAuthClient authClient,
      @Value("${INFISICAL_API_URL:https://us.infisical.com}") String apiUrl,
      @Value("${INFISICAL_PROJECT_ID:}") String projectId,
      @Value("${INFISICAL_ENVIRONMENT:dev}") String environment,
      @Value("${INFISICAL_SECRET_PATH:/}") String secretPath) {
    this(mapper, authClient, apiUrl, projectId, environment, secretPath, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
  }

  CredentialStore(
      ObjectMapper mapper,
      InfisicalAuthClient authClient,
      String apiUrl,
      String projectId,
      String environment,
      String secretPath,
      HttpClient http) {
    this.mapper = mapper;
    this.authClient = authClient;
    this.apiUrl = trimTrailingSlash(apiUrl);
    this.projectId = projectId;
    this.environment = environment;
    this.secretPath = secretPath;
    this.http = http;
  }

  public Credentials resolve(String credentialRef) throws Exception {
    validateCredentialRef(credentialRef);
    ensureConfigured();
    CachedCredential cached = cache.get(credentialRef);
    if (cached != null && cached.expiresAtMillis() > System.currentTimeMillis()) return cached.credentials();

    String encoded = URLEncoder.encode(credentialRef, StandardCharsets.UTF_8);
    String query = "projectId=" + encode(projectId)
        + "&environment=" + encode(environment)
        + "&secretPath=" + encode(secretPath)
        + "&viewSecretValue=true";

    String token = authClient.getAccessToken();
    HttpResponse<String> response = fetchSecret(encoded, query, token);
    if (response.statusCode() == 401) {
      authClient.invalidateIfCurrent(token);
      response = fetchSecret(encoded, query, authClient.getAccessToken());
    }
    if (response.statusCode() / 100 != 2) throw new IllegalStateException("Credential store request failed with HTTP " + response.statusCode() + ".");

    JsonNode root = mapper.readTree(response.body());
    String value = root.path("secret").path("secretValue").asText("");
    if (value.isBlank()) throw new IllegalStateException("Credential store returned an empty secret.");
    JsonNode parsed = mapper.readTree(value);
    String username = parsed.path("username").asText("");
    String password = parsed.path("password").asText("");
    if (username.isBlank() || password.isBlank()) throw new IllegalStateException("Credential secret must contain JSON fields username and password.");

    Credentials credentials = new Credentials(username, password);
    cache.put(credentialRef, new CachedCredential(credentials, System.currentTimeMillis() + 60_000L));
    return credentials;
  }

  public void upsert(String credentialRef, String username, String password) throws Exception {
    validateCredentialRef(credentialRef);
    if (username == null || username.isBlank()) throw new IllegalArgumentException("username is required.");
    if (password == null || password.isBlank()) throw new IllegalArgumentException("password is required.");
    ensureConfigured();

    String encoded = URLEncoder.encode(credentialRef, StandardCharsets.UTF_8);
    String body = mapper.createObjectNode()
        .put("projectId", projectId)
        .put("environment", environment)
        .put("secretValue", mapper.createObjectNode().put("username", username).put("password", password).toString())
        .put("secretPath", secretPath)
        .put("type", "shared")
        .put("skipMultilineEncoding", true)
        .toString();

    String token = authClient.getAccessToken();
    HttpResponse<String> response = writeSecret("POST", encoded, body, token);
    if (response.statusCode() == 401) {
      authClient.invalidateIfCurrent(token);
      response = writeSecret("POST", encoded, body, authClient.getAccessToken());
    }
    if (response.statusCode() == 409 || response.statusCode() == 422) {
      String retryToken = authClient.getAccessToken();
      response = writeSecret("PATCH", encoded, body, retryToken);
    }
    if (response.statusCode() / 100 != 2) throw new IllegalStateException("Credential store could not save the connection credentials (HTTP " + response.statusCode() + ").");

    cache.put(credentialRef, new CachedCredential(new Credentials(username, password), System.currentTimeMillis() + 60_000L));
  }

  private HttpResponse<String> fetchSecret(String encoded, String query, String token) throws Exception {
    HttpRequest request = HttpRequest.newBuilder(URI.create(apiUrl + "/api/v4/secrets/" + encoded + "?" + query))
        .timeout(Duration.ofSeconds(8)).header("Authorization", "Bearer " + token).GET().build();
    return http.send(request, HttpResponse.BodyHandlers.ofString());
  }

  private HttpResponse<String> writeSecret(String method, String encoded, String body, String token) throws Exception {
    HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(apiUrl + "/api/v4/secrets/" + encoded))
        .timeout(Duration.ofSeconds(8)).header("Authorization", "Bearer " + token).header("Content-Type", "application/json");
    if ("PATCH".equals(method)) builder.method("PATCH", HttpRequest.BodyPublishers.ofString(body));
    else builder.POST(HttpRequest.BodyPublishers.ofString(body));
    return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
  }

  private void ensureConfigured() {
    if (projectId.isBlank()) throw new IllegalStateException("Infisical credential store is not configured. Set INFISICAL_PROJECT_ID.");
  }

  private static void validateCredentialRef(String credentialRef) {
    if (credentialRef == null || !credentialRef.matches("[A-Za-z0-9._-]{1,200}")) throw new IllegalArgumentException("credentialRef contains invalid characters.");
  }

  private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }

  private static String trimTrailingSlash(String value) {
    String trimmed = value == null ? "" : value.trim();
    while (trimmed.endsWith("/")) trimmed = trimmed.substring(0, trimmed.length() - 1);
    return trimmed;
  }

  private record CachedCredential(Credentials credentials, long expiresAtMillis) {}
}

record Credentials(String username, String password) {}
