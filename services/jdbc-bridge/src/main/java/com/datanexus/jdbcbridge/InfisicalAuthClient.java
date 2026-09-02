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

/**
 * Exchanges an Infisical Machine Identity Universal Auth credential pair for
 * a short-lived access token and refreshes it automatically before expiry.
 * The client secret is never logged or returned by the bridge API.
 */
@Component
public class InfisicalAuthClient {
  private static final long EXPIRY_SKEW_MILLIS = 60_000L;

  private final ObjectMapper mapper;
  private final HttpClient http;
  private final String authUrl;
  private final String clientId;
  private final String clientSecret;

  private volatile AccessToken cachedToken;

  public InfisicalAuthClient(
      ObjectMapper mapper,
      @Value("${INFISICAL_AUTH_URL:https://app.infisical.com}") String authUrl,
      @Value("${INFISICAL_CLIENT_ID:}") String clientId,
      @Value("${INFISICAL_CLIENT_SECRET:}") String clientSecret) {
    this.mapper = mapper;
    this.authUrl = trimTrailingSlash(authUrl);
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
  }

  public String getAccessToken() throws Exception {
    AccessToken current = cachedToken;
    if (current != null && current.expiresAtMillis() > System.currentTimeMillis() + EXPIRY_SKEW_MILLIS) {
      return current.value();
    }

    synchronized (this) {
      current = cachedToken;
      if (current != null && current.expiresAtMillis() > System.currentTimeMillis() + EXPIRY_SKEW_MILLIS) {
        return current.value();
      }
      cachedToken = login();
      return cachedToken.value();
    }
  }

  private AccessToken login() throws Exception {
    if (clientId.isBlank() || clientSecret.isBlank()) {
      throw new IllegalStateException("Infisical Universal Auth is not configured. Set INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET.");
    }

    String form = "clientId=" + encode(clientId) + "&clientSecret=" + encode(clientSecret);
    HttpRequest request = HttpRequest.newBuilder(
            URI.create(authUrl + "/api/v1/auth/universal-auth/login"))
        .timeout(Duration.ofSeconds(8))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .POST(HttpRequest.BodyPublishers.ofString(form))
        .build();

    HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() / 100 != 2) {
      throw new IllegalStateException("Infisical authentication failed with HTTP " + response.statusCode() + ".");
    }

    JsonNode root = mapper.readTree(response.body());
    String token = root.path("accessToken").asText("");
    long expiresInSeconds = root.path("expiresIn").asLong(0L);
    if (token.isBlank() || expiresInSeconds <= 0L) {
      throw new IllegalStateException("Infisical authentication returned an invalid access token response.");
    }

    long expiresAt = System.currentTimeMillis() + Math.max(1L, expiresInSeconds * 1000L);
    return new AccessToken(token, expiresAt);
  }

  private static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  private static String trimTrailingSlash(String value) {
    String trimmed = value == null ? "" : value.trim();
    while (trimmed.endsWith("/")) trimmed = trimmed.substring(0, trimmed.length() - 1);
    return trimmed;
  }

  private record AccessToken(String value, long expiresAtMillis) {}
}
