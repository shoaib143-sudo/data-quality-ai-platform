# DataNexus JDBC Bridge

A small Dockerized Java 21/Spring Boot service that gives the DataNexus application a governed JDBC runtime outside Vercel.

## Supported drivers in the initial free setup

- PostgreSQL
- Microsoft SQL Server
- MySQL

The bridge contract is intentionally database-neutral so additional JDBC drivers can be added without changing the DataNexus application contract.

## Security model

- DataNexus sends `credential_ref`, never a database password.
- JDBC URLs containing embedded credentials are rejected.
- The bridge requires `Authorization: Bearer <JDBC_BRIDGE_TOKEN>` for all API routes except `/health`.
- Database credentials are resolved from Infisical at runtime.
- The bridge authenticates to Infisical with a Machine Identity using Universal Auth.
- The Machine Identity Client ID and Client Secret are used only to obtain a short-lived Infisical access token.
- Access tokens are cached in memory and refreshed automatically before expiry; a 401 response also forces one immediate token renewal and retry.
- Credential values are cached for 60 seconds in memory and are never returned by the API.
- Schema and table identifiers are restricted to safe identifier characters.
- Query requests are capped at 10,000 rows.
- The bridge container runs as a non-root user.

## Infisical configuration

Create one Infisical secret per `credential_ref`. The secret value must be JSON:

```json
{"username":"db_user","password":"db_password"}
```

Configure the bridge with:

- `INFISICAL_AUTH_URL` (default `https://app.infisical.com`)
- `INFISICAL_API_URL` (default `https://us.infisical.com`)
- `INFISICAL_CLIENT_ID`
- `INFISICAL_CLIENT_SECRET`
- `INFISICAL_PROJECT_ID`
- `INFISICAL_ENVIRONMENT`
- `INFISICAL_SECRET_PATH`

`INFISICAL_CLIENT_SECRET` is a secret and must only be configured in the deployment secret store. Never commit it to Git or place it in DataNexus configuration.

Infisical Machine Identities use Universal Auth to exchange a Client ID and Client Secret for a short-lived access token. The bridge implements that exchange directly and renews the token automatically. This follows Infisical's documented Machine Identity model.

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
- `INFISICAL_CLIENT_ID`
- `INFISICAL_CLIENT_SECRET`

The blueprint already supplies the non-secret Infisical settings for the current project and `dev` environment:

- `INFISICAL_AUTH_URL=https://app.infisical.com`
- `INFISICAL_API_URL=https://us.infisical.com`
- `INFISICAL_PROJECT_ID=72b315a2-a9a1-424a-9c73-f7e3054e9d6a`
- `INFISICAL_ENVIRONMENT=dev`
- `INFISICAL_SECRET_PATH=/`

Render free services are suitable for development and testing only. They can spin down after inactivity and have other free-tier limitations. Do not treat the free bridge as production infrastructure.

## DataNexus application configuration

After Render deploys successfully, set the DataNexus Vercel environment variables:

- `JDBC_BRIDGE_URL=https://<render-service>.onrender.com`
- `JDBC_BRIDGE_TOKEN=<same token as the Render service>`

Do not commit either value to Git.

## Production upgrade path

The bridge container and HTTP contract can remain unchanged when moving from free testing to production. Replace the Render free service with a persistent container platform and use a production-grade secret manager/network boundary.
