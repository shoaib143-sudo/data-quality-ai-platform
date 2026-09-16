# Certification Evidence Evaluator v1

This evaluator is a fail-closed deterministic gate for DataNexus `CERTIFIED` and `PRODUCTION_VERIFIED` claims.

It does not generate evidence and does not replace independent assurance. It evaluates evidence records against `infra/platform-assurance/post-implementation-certification-contract.json`.

For every evidence class required by the requested claim level, exactly one authoritative record is required. The record must contain every required provenance field, be bound to the exact certified source commit, have a valid observation timestamp and explicit maximum-age policy, and have a result of `PASS` or justified `NOT_APPLICABLE`. `FAIL`, `NOT_MEASURED`, `WAIVED`, stale, future-dated, duplicate, missing, wrong-head, or unknown evidence fails the claim.

`PRODUCTION_VERIFIED` is evaluated independently against every evidence class whose `requiredFor` includes `PRODUCTION_VERIFIED`; CI evidence alone cannot substitute for production evidence.
