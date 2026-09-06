package com.datanexus.jdbcbridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** Exchanges a Machine Identity Universal Auth credential pair for a short-lived token. */
@Component
public class InfisicalAuthClient {
  private static final long EXPIRY_SKEW_MILLIS = 60_000L;

  private final ObjectMapper mapper;
  private final HttpClient http;
  private final String authUrl;
  private final String clientId;
  private final String clientSecret;

  private volatile AccessToken cachedToken;

  @Autowired
  public InfisicalAuthClient(
      ObjectMapper mapper,
      @Value("${INFISICAL_AUTH_URL:https://app.infisical.com}") String authUrl,
      @Value("${INFISICAL_CLIENT_ID:}") String clientId,
      @Value("${INFISICAL_CLIENT_SECRET:}") String clientSecret) {
    this(mapper, authUrl, clientId, clientSecret, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
  }

  InfisicalAuthClient(
      ObjectMapper mapper,
      String authUrl,
      String clientId,
      String clientSecret,
      HttpClient http) {
    this.mapper = mapper;
    this.authUrl = trimTrailingSlash(authUrl);
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.http = http;
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

  /** Invalidates the cached token after a rejected API request. */
  public synchronized void invalidate() {
    cachedToken = null;
  }

  /** Invalidates only the token that caused the rejection, preserving a newer concurrent refresh. */
  public synchronized void invalidateIfCurrent(String rejectedToken) {
    if (rejectedToken != null && cachedToken != null && MessageDigestHolder.constantTimeEquals(cachedToken.value(), rejectedToken)) {
      cachedToken = null;
    }
  }

  private AccessToken login() throws Exception {
    if (clientId.isBlank() || clientSecret.isBlank()) {
      throw new IllegalStateException("Infisical Universal Auth is not configured. Set INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET.");
    }

    String form = "clientId=" + encode(clientId) + "&clientSecret=" + encode(clientSecret);
    HttpRequest request = HttpRequest.newBuilder(URI.create(authUrl + "/api/v1/auth/universal-auth/login"))
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

    return new AccessToken(token, System.currentTimeMillis() + Math.max(1L, expiresInSeconds * 1000L));
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

  private static final class MessageDigestHolder {
    private static boolean constantTimeEquals(String left, String right) {
      return java.security.MessageDigest.isEqual(left.getBytes(StandardCharsets.UTF_8), right.getBytes(StandardCharsets.UTF_8));
    }
  }
}
