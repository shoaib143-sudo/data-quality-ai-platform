package com.datanexus.jdbcbridge;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class RootStatusController {
  @GetMapping("/")
  public Map<String, Object> root() {
    return Map.of(
        "status", "ok",
        "service", "datanexus-jdbc-bridge",
        "message", "DataNexus JDBC Bridge is running.",
        "health", "/health",
        "api_authentication", "Bearer token required for /v1/* endpoints"
    );
  }
}
