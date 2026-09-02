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
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class CredentialStore {
  private final ObjectMapper mapper;
  private final HttpClient http;
  private final String apiUrl;
  private final String token;
  private final String projectId;
  private final String environment;
  private final String secretPath;
  private final Map<String, CachedCredential> cache = new ConcurrentHashMap<>();

  public CredentialStore(ObjectMapper mapper,
                         @Value("${INFISICAL_API_URL:https://us.infisical.com}") String apiUrl,
                         @Value("${INFISICAL_TOKEN:}") String token,
                         @Value("${INFISICAL_PROJECT_ID:}") String projectId,
                         @Value("${INFISICAL_ENVIRONMENT:dev}") String environment,
                         @Value("${INFISICAL_SECRET_PATH:/}") String secretPath) {
    this.mapper = mapper;
    this.apiUrl = apiUrl.replaceAll("/$", "");
    this.token = token;
    this.projectId = projectId;
    this.environment = environment;
    this.secretPath = secretPath;
    this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
  }

  public Credentials resolve(String credentialRef) throws Exception {
    if (credentialRef == null || !credentialRef.matches("[A-Za-z0-9._/-]{1,200}")) throw new IllegalArgumentException("credentialRef contains invalid characters.");
    if (token.isBlank() || projectId.isBlank()) throw new IllegalStateException("Infisical credential store is not configured.");
    CachedCredential cached = cache.get(credentialRef);
    if (cached != null && cached.expiresAtMillis() > System.currentTimeMillis()) return cached.credentials();

    String encoded = URLEncoder.encode(credentialRef, StandardCharsets.UTF_8);
    String query = "workspaceId=" + URLEncoder.encode(projectId, StandardCharsets.UTF_8)
        + "&environment=" + URLEncoder.encode(environment, StandardCharsets.UTF_8)
        + "&secretPath=" + URLEncoder.encode(secretPath, StandardCharsets.UTF_8);
    HttpRequest request = HttpRequest.newBuilder(URI.create(apiUrl + "/api/v3/secrets/raw/" + encoded + "?" + query))
        .timeout(Duration.ofSeconds(8))
        .header("Authorization", "Bearer " + token)
        .GET().build();
    HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() / 100 != 2) throw new IllegalStateException("Credential store request failed with HTTP " + response.statusCode() + ".");

    JsonNode root = mapper.readTree(response.body());
    JsonNode secret = root.path("secret");
    String value = secret.path("secretValue").asText("");
    if (value.isBlank()) throw new IllegalStateException("Credential store returned an empty secret.");
    JsonNode parsed = mapper.readTree(value);
    String username = parsed.path("username").asText("");
    String password = parsed.path("password").asText("");
    if (username.isBlank() || password.isBlank()) throw new IllegalStateException("Credential secret must contain JSON fields username and password.");
    Credentials credentials = new Credentials(username, password);
    cache.put(credentialRef, new CachedCredential(credentials, System.currentTimeMillis() + 60_000));
    return credentials;
  }

  private record CachedCredential(Credentials credentials, long expiresAtMillis) {}
}

record Credentials(String username, String password) {}
