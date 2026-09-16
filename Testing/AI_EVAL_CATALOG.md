# AI Evaluation Catalog

## Initial planning envelope

Target roughly 1,000 to 2,000 meaningful AI evaluation cases after the Feature Registry determines actual scope. This is a planning range, not a release quota.

| Family | Planning range |
| --- | ---: |
| Functional/task fidelity | 200-400 |
| Groundedness/correctness | 150-300 |
| Hallucination/nonexistent resources | 100-200 |
| Prompt injection | 150-300 |
| Agency/tool authorization | 150-300 |
| Memory/RAG | 100-200 |
| Provider/model resilience | 100-200 |

Cases may overlap families. Final counts must be risk-derived from actual features.

## Evaluation record

Each case should identify dataset/input, model/configuration, expected facts or allowed behavior, scorer, threshold, repetitions where required, observed result, evidence, and applicable risk tier.

Safety/authorization gates are binary and must not be averaged away by aggregate model-quality scores.
