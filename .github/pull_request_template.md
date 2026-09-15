## Summary

Describe the change and the production or governance outcome it is intended to achieve.

PR titles must use `type(optional-scope): Capitalized summary`. Allowed types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `security`, and `test`.

## Release checklist

- [ ] Scope is limited to the intended change.
- [ ] Security, authorization, tenant/project boundaries, and evidence contracts were considered.
- [ ] Existing released Supabase migrations were not modified; database changes use new forward migrations.
- [ ] Relevant tests and permanent verification gates were added or updated.
- [ ] `Quality Gate / build` passes.
- [ ] `CodeQL Security / analyze` passes.
- [ ] `P0-P5 Revalidation / revalidate` passes.
- [ ] `V6 Operational Certification / certify` passes.
- [ ] `V6 Operational Certification / runtime-slo` passes.
- [ ] `V6 Operational Certification / clean-database-reconstruction` passes.
- [ ] `Dependency Security Audit / dependency-audit` passes.
- [ ] `Repository Governance / repository-governance` passes.
- [ ] Deployment/runtime impact and rollback behavior are understood.
- [ ] Production readiness will be verified after merge when the change affects runtime behavior.

## Evidence

List the key test, CI, migration, telemetry, or production evidence that proves the change is safe.
