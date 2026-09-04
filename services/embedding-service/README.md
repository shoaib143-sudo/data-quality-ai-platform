# Governance Embedding Service

Self hosted semantic embedding service for the governance platform. It uses `sentence-transformers/all-MiniLM-L6-v2`, produces 384 dimension normalized vectors, and requires no paid embedding API.

## Run locally

```bash
cd services/embedding-service
docker build -t governance-embedding-service .
docker run --rm -p 8080:8080 \
  -e EMBEDDING_SERVICE_API_KEY=change-me \
  governance-embedding-service
```

Health check:

```bash
curl http://localhost:8080/health
```

Embedding request:

```bash
curl -X POST http://localhost:8080/embed \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer change-me' \
  -d '{"input":"Customer email address"}'
```

## Application configuration

Configure the Next.js application with:

```text
GOVERNANCE_EMBEDDING_URL=https://your-embedding-service.example/embed
GOVERNANCE_EMBEDDING_API_KEY=<same API key as the embedding service>
GOVERNANCE_EMBEDDING_MODEL=all-MiniLM-L6-v2
```

`GOVERNANCE_EMBEDDING_API_KEY` is optional when the embedding service is intentionally running without authentication, but production deployments should set it.

## Free deployment

`render.yaml` provides a free tier deployment blueprint. The embedding container is intentionally separate from Vercel because loading the sentence transformer model is better suited to a long lived service than a serverless request function.

The service may cold start on a free hosting tier. The application treats the embedding provider as an external dependency and returns a clear unavailable response instead of breaking ordinary lexical search or profiling.

## Indexed governance objects

The initial reindex pipeline covers:

* datasets
* glossary terms
* classification policies
* lineage transformations and their underlying logic

The registry supports additional object types such as columns, findings, document chunks, and quality incidents without a schema redesign.
