package com.datanexus.jdbcbridge;

import org.junit.jupiter.api.Test;

import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.sql.SQLTransientConnectionException;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class JdbcBridgeExceptionHandlerTest {
  private final JdbcBridgeExceptionHandler handler = new JdbcBridgeExceptionHandler();

  @Test
  void timeoutIsRetryableAndSanitized() {
    Map<String, Object> body = handler.timeout(new SQLTimeoutException("secret vendor details", "57014"));
    assertEquals("JDBC_TIMEOUT", body.get("error"));
    assertEquals(Boolean.TRUE, body.get("retryable"));
    assertEquals("57014", body.get("sql_state"));
    assertFalse(body.toString().contains("secret vendor details"));
  }

  @Test
  void transientConnectionFailureIsRetryable() {
    Map<String, Object> body = handler.unavailable(new SQLTransientConnectionException("down", "08006"));
    assertEquals("JDBC_CONNECTION_UNAVAILABLE", body.get("error"));
    assertEquals(Boolean.TRUE, body.get("retryable"));
  }

  @Test
  void ordinarySyntaxFailureIsNotRetryable() {
    Map<String, Object> body = handler.sql(new SQLException("bad sql", "42000"));
    assertEquals("JDBC_OPERATION_FAILED", body.get("error"));
    assertEquals(Boolean.FALSE, body.get("retryable"));
  }

  @Test
  void transactionRollbackStateIsRetryable() {
    Map<String, Object> body = handler.sql(new SQLException("serialization", "40001"));
    assertEquals(Boolean.TRUE, body.get("retryable"));
  }
}
