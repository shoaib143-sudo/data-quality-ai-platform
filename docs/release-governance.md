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

## Governed Vercel production deployment

Vercel production deployment is the manual `vercel-production-deploy` operation
inside `.github/workflows/release-governance.yml`.

Dispatch it from the **Release Governance** workflow on branch `main` with:

- `operation=vercel-production-deploy`;
- `commit_sha=<exact current protected main SHA>`.

The Vercel release operation does not use the Cloudflare paid-activation confirmation
inputs. Those inputs remain scoped to Cloudflare operations.

The workflow:

- accepts only an explicit 40-character commit SHA;
- requires that SHA to equal the current protected `main` SHA;
- serializes production deployments so a second release cannot overlap the first;
- uses the GitHub `production` environment;
- pins the Vercel team, project, and CLI version;
- keeps `VERCEL_TOKEN` step-scoped;
- injects immutable DataNexus release identity into the Vercel deployment;
- stages the production build without assigning production domains;
- verifies exact deployed identity, immutable artifact provenance, and critical health before promotion;
- promotes only the verified staged production deployment;
- verifies the official production alias after promotion;
- requires liveness, Supabase public Data API health, release-schema parity, and
  full readiness to pass before the workflow reports success;
- captures the current production build identity plus its immutable Vercel deployment ID/URL before promotion as recovery context;
- persists a machine-readable release evidence bundle binding the exact commit,
  previous production identity, staged artifact provenance, staged health, and
  post-promotion production health;
- retains governed Vercel release evidence for 90 days.

Automatic Vercel Git deployments remain disabled in `vercel.json`. GitHub is the
release authority; Vercel is the production deployment runtime.

The production workflow must not be changed to deploy arbitrary branches, stale
ancestors of `main`, or an unverified SHA.
