package com.datanexus.jdbcbridge;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
    "JDBC_CREDENTIAL_MODE=environment",
    "JDBC_CREDENTIAL_REF=primary-jdbc",
    "JDBC_CREDENTIAL_USERNAME=test-user",
    "JDBC_CREDENTIAL_PASSWORD=test-password",
    "JDBC_BRIDGE_TOKEN=test-bridge-token"
})
class JdbcBridgeApplicationContextTest {
  @Test
  void contextLoads() {
  }
}
