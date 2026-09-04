from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
API_KEY = os.getenv("EMBEDDING_SERVICE_API_KEY", "").strip()

app = FastAPI(title="Data Governance Embedding Service", version="1.0.0")
model = SentenceTransformer(MODEL_NAME)


class EmbeddingRequest(BaseModel):
    input: str | None = None
    text: str | None = None
    model: str | None = None


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    model: str
    dimensions: int = Field(default=384)


def require_api_key(authorization: str | None) -> None:
    if not API_KEY:
        return
    if authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid embedding service credentials")


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model": MODEL_NAME, "dimensions": 384}


@app.post("/embed", response_model=EmbeddingResponse)
def embed(payload: EmbeddingRequest, authorization: str | None = Header(default=None)) -> EmbeddingResponse:
    require_api_key(authorization)
    text = (payload.input or payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="input is required")

    vector = model.encode(text, normalize_embeddings=True).tolist()
    if len(vector) != 384:
        raise HTTPException(status_code=500, detail=f"Unexpected embedding dimensions: {len(vector)}")

    return EmbeddingResponse(
        embedding=[float(value) for value in vector],
        model=MODEL_NAME,
        dimensions=len(vector),
    )
