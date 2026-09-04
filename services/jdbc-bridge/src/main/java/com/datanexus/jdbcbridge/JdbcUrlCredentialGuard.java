package com.datanexus.jdbcbridge;

import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

import java.lang.reflect.Type;
import java.util.Map;
import java.util.regex.Pattern;

@RestControllerAdvice
public class JdbcUrlCredentialGuard extends RequestBodyAdviceAdapter {
  private static final Pattern AUTHORITY_CREDENTIALS = Pattern.compile("(?i)jdbc:[^:]+://[^/\\s@]+@");
  private static final Pattern CREDENTIAL_PROPERTY = Pattern.compile("(?i)(?:[?&;])(?:user(?:name)?|uid|password|passwd|pwd|pass|token|access_token|accesstoken|secret|client_secret)=");
  private static final Pattern ORACLE_THIN_CREDENTIALS = Pattern.compile("(?i)^jdbc:oracle:thin:[^:@/\\s]+(?:/[^@\\s]+)?@");

  @Override
  public boolean supports(MethodParameter methodParameter, Type targetType, Class<? extends HttpMessageConverter<?>> converterType) {
    Class<?> type = methodParameter.getParameterType();
    return type == JdbcBridgeController.JdbcCatalogRequest.class
        || type == JdbcBridgeController.JdbcRequest.class
        || type == JdbcBridgeController.JdbcQueryRequest.class
        || type == JdbcBridgeController.JdbcLineageRequest.class;
  }

  @Override
  public Object afterBodyRead(Object body, HttpInputMessage inputMessage, MethodParameter parameter, Type targetType,
                              Class<? extends HttpMessageConverter<?>> converterType) {
    validate(jdbcUrl(body));
    return body;
  }

  static void validate(String jdbcUrl) {
    if (jdbcUrl == null || jdbcUrl.isBlank()) return;
    if (AUTHORITY_CREDENTIALS.matcher(jdbcUrl).find()
        || CREDENTIAL_PROPERTY.matcher(jdbcUrl).find()
        || ORACLE_THIN_CREDENTIALS.matcher(jdbcUrl).find()) {
      throw new EmbeddedJdbcCredentialException();
    }
  }

  private static String jdbcUrl(Object body) {
    if (body instanceof JdbcBridgeController.JdbcCatalogRequest request) return request.jdbcUrl();
    if (body instanceof JdbcBridgeController.JdbcRequest request) return request.jdbcUrl();
    if (body instanceof JdbcBridgeController.JdbcQueryRequest request) return request.jdbcUrl();
    if (body instanceof JdbcBridgeController.JdbcLineageRequest request) return request.jdbcUrl();
    return null;
  }

  @ResponseStatus(HttpStatus.BAD_REQUEST)
  @ExceptionHandler(EmbeddedJdbcCredentialException.class)
  Map<String, String> embeddedCredentials() {
    return Map.of("error", "jdbcUrl must not contain embedded credentials; use credentialRef.");
  }

  static final class EmbeddedJdbcCredentialException extends IllegalArgumentException {
    EmbeddedJdbcCredentialException() {
      super("jdbcUrl must not contain embedded credentials; use credentialRef.");
    }
  }
}