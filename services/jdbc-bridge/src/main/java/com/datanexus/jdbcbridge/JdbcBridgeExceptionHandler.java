package com.datanexus.jdbcbridge;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.sql.SQLRecoverableException;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.sql.SQLTransientConnectionException;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class JdbcBridgeExceptionHandler {

  @ResponseStatus(HttpStatus.GATEWAY_TIMEOUT)
  @ExceptionHandler(SQLTimeoutException.class)
  Map<String, Object> timeout(SQLTimeoutException error) {
    return response("JDBC_TIMEOUT", "The database operation exceeded the configured technical timeout.", error);
  }

  @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
  @ExceptionHandler({SQLTransientConnectionException.class, SQLRecoverableException.class})
  Map<String, Object> unavailable(SQLException error) {
    return response("JDBC_CONNECTION_UNAVAILABLE", "The database connection is temporarily unavailable.", error);
  }

  @ResponseStatus(HttpStatus.BAD_GATEWAY)
  @ExceptionHandler(SQLException.class)
  Map<String, Object> sql(SQLException error) {
    return response("JDBC_OPERATION_FAILED", "The database rejected or could not complete the JDBC operation.", error);
  }

  private static Map<String, Object> response(String code, String message, SQLException error) {
    logSqlException(code, error);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("error", code);
    body.put("message", message);
    body.put("sql_state", safeState(error.getSQLState()));
    body.put("retryable", isRetryable(error));
    return body;
  }

  private static void logSqlException(String code, SQLException error) {
    String detail = sanitize(error.getMessage());
    System.err.printf("[jdbc-bridge] %s class=%s sql_state=%s vendor_code=%d detail=%s%n",
        code,
        error.getClass().getSimpleName(),
        safeState(error.getSQLState()),
        error.getErrorCode(),
        detail);
  }

  private static String sanitize(String value) {
    if (value == null || value.isBlank()) return "<none>";
    String sanitized = value.replaceAll("(?i)jdbc:[^\\s]+", "jdbc:<redacted>");
    sanitized = sanitized.replaceAll("(?i)(password|passwd|pwd|token|access_token|secret|client_secret)=([^;\\s&]+)", "$1=<redacted>");
    return sanitized;
  }

  private static String safeState(String state) {
    if (state == null || state.isBlank()) return null;
    return state.length() > 5 ? state.substring(0, 5) : state;
  }

  private static boolean isRetryable(SQLException error) {
    if (error instanceof SQLTimeoutException || error instanceof SQLTransientConnectionException || error instanceof SQLRecoverableException) return true;
    String state = error.getSQLState();
    if (state == null || state.length() < 2) return false;
    return state.startsWith("08") || state.startsWith("40") || state.startsWith("53") || state.startsWith("57");
  }
}
