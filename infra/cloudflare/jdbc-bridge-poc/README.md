# DataNexus Cloudflare JDBC bridge proof-of-fit

This directory evaluates Cloudflare Containers as a possible replacement runtime for the generic Java 21 / Spring Boot JDBC bridge.

## Safety boundary

This is a non-production proof-of-fit.

- Production `JDBC_BRIDGE_URL` remains unchanged.
- The existing Render bridge remains available as fallback.
- `DATANEXUS_JDBC_EXECUTION_ENABLED` is `false` by default.
- A live Cloudflare Container deployment requires Workers Paid and therefore requires explicit owner approval.
- Repository validation and Wrangler dry-runs do not authorize paid activation.

## Runtime shape

The Worker ingress exposes only:

- `GET|HEAD /`
- `GET|HEAD /health`
- `POST /v1/credentials`
- `POST /v1/catalog`
- `POST /v1/validate`
- `POST /v1/query`
- `POST /v1/lineage`

All protected routes require both the execution kill switch and `JDBC_BRIDGE_TOKEN` before the request is forwarded to the Java container. The Java bridge retains its own bearer-token filter, so authorization is enforced twice.

The container uses the existing `services/jdbc-bridge/Dockerfile`, listens on port 10000, is constrained to APAC, disables SSH, and uses a single `standard-1` instance for the PoC. Idle instances are allowed to sleep after 30 minutes so cold-start behavior can be measured.

## Credential boundary

The PoC passes only the bridge token and Infisical machine-identity configuration into the container. Database usernames/passwords are not declared in Wrangler configuration or source.

## Networking assessment

Cloudflare Containers can make ordinary public Internet connections. That is sufficient to test publicly reachable JDBC targets.

Private enterprise database connectivity is a separate gate. Workers VPC exposes private TCP connectivity to the Workers runtime, but the Java container's native JDBC sockets cannot directly consume a Worker VPC binding. Container outbound handlers intercept HTTP/HTTPS, not arbitrary JDBC TCP traffic. Therefore private VPC/VPN/on-premise JDBC is **not certified** by this PoC.

Likewise, a stable dedicated public source IP for third-party database allowlisting is **not certified** by this PoC. Dedicated Cloudflare egress IP capabilities belong to separate Cloudflare One/Enterprise networking features and must not be assumed to apply to Container egress without explicit evidence.

## Acceptance gates

1. Static contract, negative/failure tests and independent adversarial audit pass.
2. Existing JDBC Maven tests and Docker build pass unchanged.
3. Wrangler validates the PoC bundle with `deploy --dry-run`.
4. A paid live PoC, only after explicit approval, proves cold `/health` within the DataNexus readiness budget or documents the required keep-warm policy/cost.
5. Protected routes fail closed when execution is disabled, token configuration is absent, or bearer authentication is wrong.
6. Public PostgreSQL plus one additional non-native JDBC engine pass catalog/validate/query.
7. No database credential is exposed in Worker variables, repository files, logs, or JDBC URLs.
8. Private/VPC/static-egress requirements remain a separate architecture decision unless directly proven.

## Decision boundary

Do not change production `JDBC_BRIDGE_URL`, remove Render, or enable Cloudflare JDBC execution based solely on repository/CI success. Live paid activation and network tests are separate governed decisions.
