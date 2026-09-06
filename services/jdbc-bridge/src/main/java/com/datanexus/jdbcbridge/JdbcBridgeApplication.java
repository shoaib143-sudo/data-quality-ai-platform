package com.datanexus.jdbcbridge;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;

@SpringBootApplication
@ComponentScan(excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = CredentialStore.class))
public class JdbcBridgeApplication {
  public static void main(String[] args) {
    SpringApplication.run(JdbcBridgeApplication.class, args);
  }
}
