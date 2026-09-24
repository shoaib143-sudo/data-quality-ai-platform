# Release Governance

## Protected branch

`main` is the production release branch.

The intended GitHub branch protection rule for `main` is:

- Require a pull request before merging.
- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Do not allow force pushes.
- Do not allow branch deletion.
- Do not require signed commits or linear history unless separately approved.
- Do not require code-owner approval while the repository has a single active owner.

## Required status checks

The mandatory release checks are:

- `Release Governance / release-governance`
- `Quality Gate / build`
- `CodeQL Security / analyze`
- `P0-P5 Revalidation / revalidate`
- `V6 Operational Certification / certify`

These checks are intentionally limited to stable, always-on release gates. Path-scoped workflows may still run and fail a pull request, but they should not be configured as required branch-protection contexts if they are not guaranteed to emit on every pull request.

## Migration policy

Released files under `supabase/migrations/` are immutable. Corrections must be delivered through new forward migrations. The `Release Governance` workflow rejects modifications, deletions, or renames of migrations that already exist on the target branch.

## Merge policy

Use pull requests for all changes to `main`. Merge only after all required checks succeed and the branch is current with `main`.

Emergency changes must still use a pull request and the same required checks. If GitHub is unavailable, record the incident and reconcile through a reviewed pull request as soon as service is restored.

## Deployment policy

A merge to `main` is eligible for production deployment only after the required release checks pass. Production readiness is then verified through the existing Vercel, Render, Supabase, OPA, OTLP, JDBC, queue, and governance health contracts.
