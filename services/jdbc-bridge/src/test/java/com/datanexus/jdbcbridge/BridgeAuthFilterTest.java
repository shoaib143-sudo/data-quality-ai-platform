package com.datanexus.jdbcbridge;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BridgeAuthFilterTest {
  @Test
  void rejectsMissingToken() throws Exception {
    BridgeAuthFilter filter = new BridgeAuthFilter("expected-token");
    var request = new MockHttpServletRequest("POST", "/v1/query");
    var response = new MockHttpServletResponse();
    filter.doFilter(request, response, new MockFilterChain());
    assertEquals(401, response.getStatus());
  }

  @Test
  void rejectsWrongToken() throws Exception {
    BridgeAuthFilter filter = new BridgeAuthFilter("expected-token");
    var request = new MockHttpServletRequest("POST", "/v1/query");
    request.addHeader("Authorization", "Bearer wrong-token");
    var response = new MockHttpServletResponse();
    filter.doFilter(request, response, new MockFilterChain());
    assertEquals(401, response.getStatus());
  }

  @Test
  void acceptsCorrectToken() throws Exception {
    BridgeAuthFilter filter = new BridgeAuthFilter("expected-token");
    var request = new MockHttpServletRequest("POST", "/v1/query");
    request.addHeader("Authorization", "Bearer expected-token");
    var response = new MockHttpServletResponse();
    var chain = new MockFilterChain();
    filter.doFilter(request, response, chain);
    assertEquals(200, response.getStatus());
  }

  @Test
  void healthRemainsPublic() throws Exception {
    BridgeAuthFilter filter = new BridgeAuthFilter("");
    var request = new MockHttpServletRequest("GET", "/health");
    var response = new MockHttpServletResponse();
    var chain = new MockFilterChain();
    filter.doFilter(request, response, chain);
    assertEquals(200, response.getStatus());
  }

  @Test
  void rootStatusRemainsPublic() throws Exception {
    BridgeAuthFilter filter = new BridgeAuthFilter("");
    var request = new MockHttpServletRequest("GET", "/");
    var response = new MockHttpServletResponse();
    var chain = new MockFilterChain();
    filter.doFilter(request, response, chain);
    assertEquals(200, response.getStatus());
  }
}
