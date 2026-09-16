# Certification Gates

## Required release evidence

A critical capability is CERTIFIED only when all applicable gates pass on the exact revision and deployment:

1. Implementation complete.
2. Unit and contract verification.
3. API/service/database integration verification.
4. Negative, boundary, and adversarial verification.
5. RBAC/security verification.
6. State-machine and invariant verification.
7. Concurrency, idempotency, and recovery verification.
8. AI evaluations where AI participates.
9. Real browser E2E.
10. UI/API/DB/storage/audit reconciliation.
11. Performance/SLO verification where requirements exist.
12. Preview deployment smoke.
13. Production deployment smoke.
14. Synthetic production journey.
15. Regression automation for every escaped defect.
16. Zero known critical/high defects in certification scope.

## Reporting

Do not claim "100% tested." Report feature inventory coverage, requirement traceability, mandatory gate pass rate, critical E2E coverage, RBAC/security coverage, invariant/negative coverage, known defects by severity, exact-main result, and production smoke result.

Certification is suspended when a mandatory production probe or newly discovered defect invalidates a certified invariant.
