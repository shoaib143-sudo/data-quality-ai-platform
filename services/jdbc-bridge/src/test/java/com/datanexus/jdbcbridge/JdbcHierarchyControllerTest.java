package com.datanexus.jdbcbridge;

import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JdbcHierarchyControllerTest {
  @Test
  void exposesNativeSchemasObjectsAndFieldsWithoutRenamingThem() throws Exception {
    String url = "jdbc:h2:mem:nativehierarchy;DB_CLOSE_DELAY=-1";
    try (Connection connection = DriverManager.getConnection(url, "sa", ""); Statement statement = connection.createStatement()) {
      statement.execute("CREATE SCHEMA IF NOT EXISTS ANALYTICS");
      statement.execute("CREATE TABLE ANALYTICS.PATIENT (ID INTEGER NOT NULL, NAME VARCHAR(100))");
      statement.execute("CREATE VIEW ANALYTICS.PATIENT_NAMES AS SELECT NAME FROM ANALYTICS.PATIENT");
    }

    CredentialStore credentials = mock(CredentialStore.class);
    when(credentials.resolve("DGP_TEST")).thenReturn(new Credentials("sa", ""));
    JdbcHierarchyController controller = new JdbcHierarchyController(credentials);

    JdbcHierarchyController.HierarchyResponse response = controller.hierarchy(new JdbcHierarchyController.HierarchyRequest(url, "DGP_TEST"));

    assertThat(response.databaseProduct()).containsIgnoringCase("H2");
    assertThat(response.nodes()).anySatisfy(node -> {
      assertThat(node.kind()).isEqualTo("SCHEMA");
      assertThat(node.name()).isEqualTo("ANALYTICS");
    });
    assertThat(response.nodes()).anySatisfy(node -> {
      assertThat(node.kind()).isEqualTo("OBJECT");
      assertThat(node.name()).isEqualTo("PATIENT");
      assertThat(node.nativeType()).containsIgnoringCase("TABLE");
    });
    assertThat(response.nodes()).anySatisfy(node -> {
      assertThat(node.kind()).isEqualTo("FIELD");
      assertThat(node.name()).isEqualTo("ID");
      assertThat(node.qualifiedName()).contains("PATIENT.ID");
    });
    assertThat(response.nodes()).anySatisfy(node -> {
      assertThat(node.system()).isTrue();
      assertThat(node.name()).isEqualToIgnoringCase("INFORMATION_SCHEMA");
    });
  }
}
