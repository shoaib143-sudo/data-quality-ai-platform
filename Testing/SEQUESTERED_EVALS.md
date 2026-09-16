# Sequestered AI Evaluation Strategy

## Dataset tiers

1. Development set: visible for implementation and debugging.
2. Regression set: version-controlled stable cases for continuous CI.
3. Sequestered certification set: controlled by the certification harness and not exposed to agent runtime context or normal development prompts.

## Requirements

The harness selects sequestered cases automatically, prevents leakage into runtime context, records dataset/evaluator versions, and produces machine-scored results. Certification cases should include novel combinations and adversarial variants.

Periodically rotate certification cases and test for contamination. Access to sequestered truth must not be required by application code.
