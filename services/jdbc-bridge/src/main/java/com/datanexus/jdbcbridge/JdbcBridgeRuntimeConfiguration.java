package com.datanexus.jdbcbridge;

import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.sql.DriverManager;
import java.util.Optional;

@Component
public class JdbcBridgeRuntimeConfiguration {
  static final int DEFAULT_LOGIN_TIMEOUT_SECONDS = 20;

  @PostConstruct
  void configureDriverManager() {
    DriverManager.setLoginTimeout(environmentInt(
        "JDBC_BRIDGE_LOGIN_TIMEOUT_SECONDS",
        DEFAULT_LOGIN_TIMEOUT_SECONDS,
        1,
        120
    ));
  }

  static int environmentInt(String name, int fallback, int min, int max) {
    try {
      int parsed = Integer.parseInt(Optional.ofNullable(System.getenv(name)).orElse(""));
      return Math.max(min, Math.min(max, parsed));
    } catch (Exception ignored) {
      return fallback;
    }
  }
}
