package com.datanexus.jdbcbridge;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CredentialStoreConfiguration {
  @Bean
  CredentialStore credentialStore(
      ObjectMapper mapper,
      InfisicalAuthClient authClient,
      @Value("${INFISICAL_API_URL:https://us.infisical.com}") String apiUrl,
      @Value("${INFISICAL_PROJECT_ID:}") String projectId,
      @Value("${INFISICAL_ENVIRONMENT:dev}") String environment,
      @Value("${INFISICAL_SECRET_PATH:/}") String secretPath,
      @Value("${JDBC_CREDENTIAL_MODE:infisical}") String credentialMode,
      @Value("${JDBC_CREDENTIAL_REF:}") String environmentCredentialRef,
      @Value("${JDBC_CREDENTIAL_USERNAME:}") String environmentUsername,
      @Value("${JDBC_CREDENTIAL_PASSWORD:}") String environmentPassword) {
    return new CredentialStore(
        mapper,
        authClient,
        apiUrl,
        projectId,
        environment,
        secretPath,
        credentialMode,
        environmentCredentialRef,
        environmentUsername,
        environmentPassword,
        java.net.http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(5)).build()
    );
  }
}
