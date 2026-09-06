package com.datanexus.jdbcbridge;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RootStatusControllerTest {
  @Test
  void returnsNonSensitiveServiceStatus() throws Exception {
    MockMvc mvc = MockMvcBuilders.standaloneSetup(new RootStatusController()).build();

    mvc.perform(get("/"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ok"))
        .andExpect(jsonPath("$.service").value("datanexus-jdbc-bridge"))
        .andExpect(jsonPath("$.health").value("/health"))
        .andExpect(jsonPath("$.api_authentication").value("Bearer token required for /v1/* endpoints"));
  }
}
