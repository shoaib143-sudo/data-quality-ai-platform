# DataNexus JDBC Bridge

A small Dockerized Java 21/Spring Boot service that gives the DataNexus application a governed JDBC runtime outside Vercel.

## Supported drivers

- PostgreSQL
- Microsoft SQL Server
- MySQL
- MariaDB
- Databricks
- Snowflake
- Amazon Redshift
- Oracle

The bridge contract is intentionally database-neutral so additional JDBC drivers can be added without changing the DataNexus application contract.

## Security model

- DataNexus sends `credential_ref`, never a database password.
- JDBC URLs containing embedded credentials are rejected.
- The bridge requires `Authorization: Bearer <JDBC_BRIDGE_TOKEN>` for all API routes except `/health`.
- Database connections are opened read-only by the bridge.
- Schema and table identifiers are restricted to safe identifier characters.
- Query requests are bounded by a technical row ceiling.
- The bridge container runs as a non-root user.

The preferred production credential mode is Infisical. A constrained `environment` mode is also supported for development/demo infrastructure that cannot run a secret manager yet. Environment mode supports one credential reference and keeps the username/password in server-side deployment environment variables only. It never accepts credentials in the JDBC URL and disables the credential-write endpoint.

## Temporary environment credential mode

Use this mode only when a secret manager is unavailable.

Configure the bridge with:

- `JDBC_BRIDGE_TOKEN` — a long random bearer token shared only with the DataNexus server.
- `JDBC_CREDENTIAL_MODE=environment`
- `JDBC_CREDENTIAL_REF` — a non-secret identifier such as `primary-jdbc`.
- `JDBC_CREDENTIAL_USERNAME` — the database login. Prefer a dedicated read-only account.
- `JDBC_CREDENTIAL_PASSWORD` — the database password.

Do not commit any of these credential values to Git. Do not use `NEXT_PUBLIC_*` variables for them. Do not embed the username/password in the JDBC URL.

In environment mode `/v1/credentials` is intentionally disabled. To rotate the database password, update `JDBC_CREDENTIAL_PASSWORD` in the deployment environment and redeploy/restart the bridge.

A Render blueprint for this temporary mode is included as `render-environment.yaml`.

## Infisical credential mode

Infisical remains the preferred production model. Create one Infisical secret per `credential_ref`. The secret value must be JSON:

```json
{"username":"db_user","password":"db_password"}
```

Configure the bridge with:

- `JDBC_CREDENTIAL_MODE=infisical` (default)
- `INFISICAL_AUTH_URL` (default `https://app.infisical.com`)
- `INFISICAL_API_URL` (default `https://us.infisical.com`)
- `INFISICAL_CLIENT_ID`
- `INFISICAL_CLIENT_SECRET`
- `INFISICAL_PROJECT_ID`
- `INFISICAL_ENVIRONMENT`
- `INFISICAL_SECRET_PATH`

`INFISICAL_CLIENT_SECRET` is a secret and must only be configured in the deployment secret store. Never commit it to Git or place it in DataNexus configuration.

Infisical Machine Identities use Universal Auth to exchange a Client ID and Client Secret for a short-lived access token. The bridge renews that token automatically. Credential values are cached for 60 seconds in memory and are never returned by the API.

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
  -d '{"jdbc_url":"jdbc:postgresql://host:5432/db","credential_ref":"primary-jdbc","schema":"public","table":"customers"}'
```

## Render deployment

This directory includes two blueprints:

- `render.yaml` — preferred Infisical-backed mode.
- `render-environment.yaml` — temporary single-credential environment mode.

For the temporary mode, create a Render Web Service from the repository using `services/jdbc-bridge/render-environment.yaml`, or configure a Docker Web Service with root directory `services/jdbc-bridge` and the environment variables listed above.

After Render deploys successfully, set the DataNexus Vercel server-side environment variables:

- `JDBC_BRIDGE_URL=https://<render-service>.onrender.com`
- `JDBC_BRIDGE_TOKEN=<same token as the Render service>`

Do not commit either value to Git.

## JDBC connection examples

Use a JDBC URL without credentials:

- PostgreSQL: `jdbc:postgresql://HOST:5432/DATABASE`
- SQL Server: `jdbc:sqlserver://HOST:1433;databaseName=DATABASE;encrypt=true`
- MySQL: `jdbc:mysql://HOST:3306/DATABASE`
- MariaDB: `jdbc:mariadb://HOST:3306/DATABASE`
- Snowflake: `jdbc:snowflake://ACCOUNT.snowflakecomputing.com/?db=DATABASE&schema=SCHEMA`
- Redshift: `jdbc:redshift://HOST:5439/DATABASE`
- Oracle: `jdbc:oracle:thin:@//HOST:1521/SERVICE`

Use the same `JDBC_CREDENTIAL_REF` value when DataNexus calls `/v1/catalog`, `/v1/validate`, `/v1/query`, or `/v1/lineage`.

## Production upgrade path

The bridge container and HTTP contract remain unchanged when moving from the temporary environment mode to a production secret manager. Switch `JDBC_CREDENTIAL_MODE` back to `infisical`, configure the Infisical machine identity, and keep the DataNexus-side `credential_ref` contract unchanged.
