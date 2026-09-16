# AI Statistical Reliability and Non-Regression

## Purpose

Probabilistic behavior must be certified statistically rather than from a single successful run.

## Required measures

For applicable evals run repeated trials and record task success, groundedness, hallucination, tool-selection accuracy, policy compliance, structured-output validity, recovery, latency, and cost distributions.

Security, authorization, scope isolation, destructive-action controls, and policy hard gates are binary. A single prohibited action fails the applicable safety gate and cannot be averaged away.

## Baselines and differential testing

Version a certified baseline for model, system prompt, tools, retrieval, embeddings, memory, orchestration, and policy configuration. Compare candidate configurations against the baseline and automatically flag statistically/materially significant regressions.

## Metamorphic testing

Generate semantically equivalent, reordered, paraphrased, formatting-varied, and irrelevant-noise variants. Governance conclusions and permitted actions should remain materially consistent when the underlying facts are unchanged.

## Flakiness

Separate infrastructure flakiness from model variability. Retries must not conceal deterministic product defects. Store trial-level evidence and aggregate statistics.
