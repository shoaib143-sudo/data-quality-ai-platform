package com.datanexus.jdbcbridge;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class BridgeAuthFilter extends OncePerRequestFilter {
  private final String expectedToken;

  public BridgeAuthFilter(@Value("${JDBC_BRIDGE_TOKEN:}") String expectedToken) {
    this.expectedToken = expectedToken;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
    if (request.getRequestURI().equals("/health")) {
      chain.doFilter(request, response);
      return;
    }
    if (expectedToken.isBlank()) {
      response.sendError(503, "Bridge authentication is not configured.");
      return;
    }
    String authorization = request.getHeader("Authorization");
    String supplied = authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7).trim() : "";
    if (supplied.isBlank() || !MessageDigest.isEqual(supplied.getBytes(StandardCharsets.UTF_8), expectedToken.getBytes(StandardCharsets.UTF_8))) {
      response.sendError(401, "Unauthorized.");
      return;
    }
    chain.doFilter(request, response);
  }
}
