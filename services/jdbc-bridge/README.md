# DataNexus JDBC Bridge

A small Dockerized Java 21/Spring Boot service that gives the DataNexus application a governed JDBC runtime outside Vercel.

## Supported drivers in the initial free setup

- PostgreSQL
- Microsoft SQL Server
- MySQL

The bridge contract is intentionally database-neutral so additional JDBC drivers can be added without changing the DataNexus application contract.

## Security model

- DataNexus sends `credential_ref`, never a password.
- JDBC URLs containing embedded credentials are rejected.
- The bridge requires `Authorization: Bearer <JDBC_BRIDGE_TOKEN>` for all API routes except `/health`.
- Credentials are resolved from Infisical at runtime.
- Credential values are cached for 60 seconds in memory and are never returned by the API.
- Schema and table identifiers are restricted to safe identifier characters.
- Query requests are capped at 10,000 rows.
- The bridge container runs as a non-root user.

## Infisical credential format

Create one Infisical secret per `credential_ref`. The secret value must be JSON:

```json
{"username":"db_user","password":"db_password"}
```

Configure the bridge with:

- `INFISICAL_API_URL`
- `INFISICAL_TOKEN`
- `INFISICAL_PROJECT_ID`
- `INFISICAL_ENVIRONMENT`
- `INFISICAL_SECRET_PATH`

Use a dedicated Infisical machine identity or appropriately scoped service token. Infisical documents machine identities as the recommended approach for application authentication. See the official documentation: https://infisical.com/docs/documentation/platform/identities/machine-identities

## Local run

Set the required environment variables and run:

```bash
mvn spring-boot:run
```

Health:

```bash
curl http://localhost:10000/health
```

Validation:

```bash
curl -X POST http://localhost:10000/v1/validate \
  -H 'Authorization: Bearer YOUR_BRIDGE_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"jdbc_url":"jdbc:postgresql://host:5432/db","credential_ref":"customer-postgres","schema":"public","table":"customers"}'
```

## Render free deployment

This directory includes a `render.yaml` blueprint. Create a Render Web Service from the repository, select the `services/jdbc-bridge` root directory when using the dashboard, or use the Blueprint file.

Set these secrets in Render:

- `JDBC_BRIDGE_TOKEN`
- `INFISICAL_TOKEN`
- `INFISICAL_PROJECT_ID`

The other Infisical settings are already defined by the blueprint for the default US Infisical service and `dev` environment.

Render free services are suitable for development and testing only. They can spin down after inactivity and have other free-tier limitations. Do not treat the free bridge as production infrastructure.

## DataNexus application configuration

After Render deploys successfully, set the DataNexus Vercel environment variables:

- `JDBC_BRIDGE_URL=https://<render-service>.onrender.com`
- `JDBC_BRIDGE_TOKEN=<same token as the Render service>`

Do not commit either value to Git.

## Production upgrade path

The bridge container and HTTP contract can remain unchanged when moving from free testing to production. Replace the Render free service with a persistent container platform and use a production-grade secret manager/network boundary.
