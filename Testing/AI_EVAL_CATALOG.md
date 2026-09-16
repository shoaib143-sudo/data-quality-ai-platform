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


## Automated scoring requirement

Release-gating AI evaluations must be machine scored. Use deterministic ground-truth assertions where possible and versioned automated evaluators where semantic judgment is required. Safety, authorization, scope isolation, tool permission, and policy-compliance checks remain binary hard gates. Human review may improve future datasets or thresholds but is never required to complete a certification run.
